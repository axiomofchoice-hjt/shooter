/** Autonomous escort funnels: target picking, flight and firing. */

import type { Enemy, Funnel } from '../core/entities';
import { TAU, angleDelta, clamp, dist, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import type { WeaponSpec } from '../weapons';
import { WEAPONS } from '../weapons';
import { spawnBurst } from './fx';
import { roomBounds } from './world';

type FunnelSpec = NonNullable<WeaponSpec['funnel']>;

/** Drop every drone: weapon switch, room change, death or run reset. */
export function clearFunnels(world: GameWorld) {
  if (world.funnels.length > 0) world.funnels.length = 0;
}

/**
 * Funnels run on their own. The trigger is deliberately not consulted: they
 * pick a target, fly to a clear spot near it, hold there while it is in range
 * and fire whenever their nose is lined up. With no enemy in the room they
 * trail the player instead. They are invulnerable and are never enemy targets.
 */
export function updateFunnels(world: GameWorld, dt: number) {
  const weapon = WEAPONS[world.player.weapon];
  const spec = weapon.funnel;
  if (!spec || world.player.dead) {
    clearFunnels(world);
    return;
  }

  ensureFunnels(world, weapon, spec);

  // Every drone targets on its own: no shared target and no "you take this
  // one" hand-off between the two. They may pick the same enemy, which is
  // fine — that is what independent acquisition means.
  for (let i = 0; i < world.funnels.length; i++) {
    const funnel = world.funnels[i];
    let target = currentTarget(world, funnel);
    if (!target) {
      target = pickTarget(world, funnel);
      funnel.targetId = target ? target.id : null;
    }
    updateFunnel(world, funnel, target, i, dt, weapon, spec);
  }
}

function ensureFunnels(world: GameWorld, weapon: WeaponSpec, spec: FunnelSpec) {
  const player = world.player;
  const bounds = roomBounds(world);
  while (world.funnels.length < spec.count) {
    const index = world.funnels.length;
    const angle = escortAngle(world, index, spec);
    const x = clamp(
      player.x + Math.cos(angle) * spec.escortRadius,
      bounds.left + 18,
      bounds.right - 18,
    );
    const y = clamp(
      player.y + Math.sin(angle) * spec.escortRadius,
      bounds.top + 18,
      bounds.bottom - 18,
    );
    world.funnels.push({
      x,
      y,
      vx: 0,
      vy: 0,
      angle,
      // Stagger the first shot so the two drones do not fire as one volley.
      cooldown: 0.25 + (index * weapon.cooldown) / spec.count,
      muzzle: 0,
      targetId: null,
      holdTimer: 0,
      settled: false,
      seed: rand(0, TAU),
    });
    spawnBurst(world, x, y, weapon.color, 6, 100, 0.28);
  }
}

/** Two slots behind the travel direction (or the hull when standing still). */
function escortAngle(world: GameWorld, index: number, spec: FunnelSpec) {
  const player = world.player;
  const moving = Math.hypot(player.vx, player.vy) > 40;
  const base = moving ? Math.atan2(player.vy, player.vx) : player.angle;
  const offset =
    spec.count > 1
      ? (index / (spec.count - 1) - 0.5) * 2 * spec.escortSpread
      : 0;
  return base + Math.PI + offset;
}

function updateFunnel(
  world: GameWorld,
  funnel: Funnel,
  target: Enemy | null,
  index: number,
  dt: number,
  weapon: WeaponSpec,
  spec: FunnelSpec,
) {
  const player = world.player;
  funnel.cooldown = Math.max(0, funnel.cooldown - dt);
  funnel.muzzle = Math.max(0, funnel.muzzle - dt);
  funnel.holdTimer = Math.max(0, funnel.holdTimer - dt);

  const bounds = roomBounds(world);
  let desiredX = funnel.x;
  let desiredY = funnel.y;
  let canShoot = false;

  if (target) {
    const targetDistance = dist(funnel.x, funnel.y, target.x, target.y);
    const clear = hasClearShot(world, funnel, target);
    const inBand =
      targetDistance >= spec.minStandoff && targetDistance <= spec.maxStandoff;
    if (clear && inBand) {
      // Already close enough with a clean line: this is a firing spot.
      canShoot = true;
    } else {
      // Fly all the way to the standoff ring. The drones are not leashed to
      // the player: stopping halfway would leave them parked out of range
      // and not firing, which reads as a broken weapon.
      const angle = firingAngle(world, funnel, target, index, spec);
      desiredX = target.x + Math.cos(angle) * spec.standoff;
      desiredY = target.y + Math.sin(angle) * spec.standoff;
    }
  } else {
    const angle = escortAngle(world, index, spec);
    desiredX = player.x + Math.cos(angle) * spec.escortRadius;
    desiredY = player.y + Math.sin(angle) * spec.escortRadius;
  }

  desiredX = clamp(desiredX, bounds.left + 18, bounds.right - 18);
  desiredY = clamp(desiredY, bounds.top + 18, bounds.bottom - 18);

  if (target && !canShoot) {
    // A slot clamped against a wall can end up on top of the target. If that
    // happened, take the same standoff on the room-centre side instead, so
    // the drone always has a real firing spot to reach rather than parking
    // too close and never shooting.
    const fromTarget = Math.hypot(desiredX - target.x, desiredY - target.y);
    if (fromTarget < spec.minStandoff) {
      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;
      const away = Math.atan2(centerY - target.y, centerX - target.x);
      desiredX = clamp(
        target.x + Math.cos(away) * spec.standoff,
        bounds.left + 18,
        bounds.right - 18,
      );
      desiredY = clamp(
        target.y + Math.sin(away) * spec.standoff,
        bounds.top + 18,
        bounds.bottom - 18,
      );
    }
  }

  if (funnel.holdTimer > 0) {
    // Brace before a shot or recover after one: stay planted for the window.
    funnel.vx = 0;
    funnel.vy = 0;
  } else if (canShoot) {
    // First frame on a firing spot: stop and settle before the first shot.
    if (!funnel.settled) {
      funnel.settled = true;
      funnel.holdTimer = spec.braceTime;
    }
    funnel.vx = 0;
    funnel.vy = 0;
  } else {
    funnel.settled = false;
    steerTo(funnel, desiredX, desiredY, spec, dt);
  }

  funnel.x += funnel.vx * dt;
  funnel.y += funnel.vy * dt;
  confineFunnel(funnel, bounds);
  aimFunnel(world, funnel, target, dt, weapon, spec);
  fireFunnel(world, funnel, target, weapon, spec);
}

/** Fan the slots out on the player's side of the target. */
function firingAngle(
  world: GameWorld,
  funnel: Funnel,
  target: Enemy,
  index: number,
  spec: FunnelSpec,
) {
  const player = world.player;
  const offset = (index - (spec.count - 1) / 2) * spec.slotArc;
  if (dist(player.x, player.y, target.x, target.y) < 32) {
    return Math.atan2(funnel.y - target.y, funnel.x - target.x) + offset;
  }
  const toPlayer = Math.atan2(player.y - target.y, player.x - target.x);
  return toPlayer + offset;
}

function currentTarget(world: GameWorld, funnel: Funnel) {
  if (funnel.targetId === null) return null;
  const enemy = findEnemy(world, funnel.targetId);
  return enemy && isTargetable(world, enemy) ? enemy : null;
}

function findEnemy(world: GameWorld, id: number) {
  for (const enemy of world.enemies) {
    if (enemy.id === id) return enemy;
  }
  return null;
}

/**
 * Every enemy in the room is fair game, including the training dummy, so the
 * start room doubles as a live target for checking the drone output.
 */
function isTargetable(world: GameWorld, enemy: Enemy) {
  if (enemy.dead) return false;
  return inRoom(world, enemy.x, enemy.y);
}

/** Nearest valid enemy to this drone, with no coordination with the other. */
function pickTarget(world: GameWorld, funnel: Funnel): Enemy | null {
  let best: Enemy | null = null;
  let bestDistance = Infinity;
  for (const enemy of world.enemies) {
    if (!isTargetable(world, enemy)) continue;
    const distance = dist(funnel.x, funnel.y, enemy.x, enemy.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

function inRoom(world: GameWorld, x: number, y: number) {
  const bounds = roomBounds(world);
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

/**
 * The arena is one convex room with no interior cover, so two points inside
 * the current room always see each other. The check still keeps a drone from
 * firing through a wall into a different room.
 */
function hasClearShot(
  world: GameWorld,
  funnel: Funnel,
  target: Enemy,
) {
  return inRoom(world, funnel.x, funnel.y) && inRoom(world, target.x, target.y);
}

function steerTo(
  funnel: Funnel,
  tx: number,
  ty: number,
  spec: FunnelSpec,
  dt: number,
) {
  const dx = tx - funnel.x;
  const dy = ty - funnel.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    funnel.vx = 0;
    funnel.vy = 0;
    return;
  }
  // No inertia: velocity points straight at the slot at a fixed cruise speed,
  // and is capped so the last step lands exactly on the slot. There is no
  // acceleration or residual drift, so a stopped drone stops immediately.
  const speed = Math.min(spec.droneSpeed, distance / Math.max(dt, 0.001));
  funnel.vx = (dx / distance) * speed;
  funnel.vy = (dy / distance) * speed;
}

function confineFunnel(
  funnel: Funnel,
  bounds: ReturnType<typeof roomBounds>,
) {
  const margin = 18;
  if (funnel.x < bounds.left + margin) {
    funnel.x = bounds.left + margin;
    funnel.vx = Math.max(0, funnel.vx);
  } else if (funnel.x > bounds.right - margin) {
    funnel.x = bounds.right - margin;
    funnel.vx = Math.min(0, funnel.vx);
  }
  if (funnel.y < bounds.top + margin) {
    funnel.y = bounds.top + margin;
    funnel.vy = Math.max(0, funnel.vy);
  } else if (funnel.y > bounds.bottom - margin) {
    funnel.y = bounds.bottom - margin;
    funnel.vy = Math.min(0, funnel.vy);
  }
}

function aimFunnel(
  world: GameWorld,
  funnel: Funnel,
  target: Enemy | null,
  dt: number,
  weapon: WeaponSpec,
  spec: FunnelSpec,
) {
  let want = funnel.angle;
  if (target) {
    const lead = Math.min(
      spec.leadTime,
      dist(funnel.x, funnel.y, target.x, target.y) / weapon.speed,
    );
    want = Math.atan2(
      target.y + target.vy * lead - funnel.y,
      target.x + target.vx * lead - funnel.x,
    );
  } else {
    const speed = Math.hypot(funnel.vx, funnel.vy);
    if (speed > 30) {
      want = Math.atan2(funnel.vy, funnel.vx);
    } else {
      // Parked with nobody to shoot: face the same way as the player's hull.
      want = world.player.angle;
    }
  }
  const maxTurn = spec.turnRate * dt;
  funnel.angle += clamp(angleDelta(funnel.angle, want), -maxTurn, maxTurn);
}

function fireFunnel(
  world: GameWorld,
  funnel: Funnel,
  target: Enemy | null,
  weapon: WeaponSpec,
  spec: FunnelSpec,
) {
  if (!target || funnel.cooldown > 0) return;
  // Once it has committed to a spot it stays put through the brace window;
  // the recovery window after each shot keeps it planted too.
  if (!funnel.settled || funnel.holdTimer > 0) return;
  if (!hasClearShot(world, funnel, target)) return;

  const distance = dist(funnel.x, funnel.y, target.x, target.y);
  const lead = Math.min(spec.leadTime, distance / weapon.speed);
  const aimX = target.x + target.vx * lead;
  const aimY = target.y + target.vy * lead;
  const want = Math.atan2(aimY - funnel.y, aimX - funnel.x);
  // Wait for the hull to finish turning instead of snapping the shot.
  if (Math.abs(angleDelta(funnel.angle, want)) > 0.2) return;

  funnel.cooldown = weapon.cooldown;
  funnel.muzzle = 0.08;
  funnel.holdTimer = spec.recoverTime;
  const x = funnel.x + Math.cos(funnel.angle) * 12;
  const y = funnel.y + Math.sin(funnel.angle) * 12;
  world.bullets.push({
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(want) * weapon.speed,
    vy: Math.sin(want) * weapon.speed,
    radius: weapon.radius,
    damage: weapon.damage,
    // No range expiry: the shot flies until it hits something or leaves the
    // room. A long sight line is still a valid firing line.
    life: Infinity,
    color: weapon.color,
    pierce: 0,
    hitIds: [],
  });
  world.sfx.play('funnel');
  spawnBurst(world, x, y, weapon.color, 2, 55, 0.16);
}
