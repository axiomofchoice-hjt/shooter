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

  // Reserve the live target of every drone first, so a drone that just lost
  // its target does not steal a target another drone is already handling.
  const taken = new Set<number>();
  for (const funnel of world.funnels) {
    const current = currentTarget(world, funnel);
    if (current) taken.add(current.id);
  }

  for (let i = 0; i < world.funnels.length; i++) {
    const funnel = world.funnels[i];
    let target = currentTarget(world, funnel);
    if (!target) {
      target = pickTarget(world, funnel, taken);
      funnel.targetId = target ? target.id : null;
    }
    if (target) taken.add(target.id);
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
      cooldown: 0.25,
      muzzle: 0,
      targetId: null,
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

  const bounds = roomBounds(world);
  let desiredX = funnel.x;
  let desiredY = funnel.y;
  let holding = false;

  if (target) {
    const targetDistance = dist(funnel.x, funnel.y, target.x, target.y);
    const clear = hasClearShot(world, funnel, target);
    const inBand =
      targetDistance >= spec.minStandoff && targetDistance <= spec.maxStandoff;
    const nearPlayer =
      dist(funnel.x, funnel.y, player.x, player.y) <= spec.leash;
    if (clear && inBand && nearPlayer) {
      // Already close enough with a clean line: hold this spot and shoot.
      holding = true;
    } else {
      const angle = firingAngle(world, funnel, target, index, spec);
      desiredX = target.x + Math.cos(angle) * spec.standoff;
      desiredY = target.y + Math.sin(angle) * spec.standoff;
      const dx = desiredX - player.x;
      const dy = desiredY - player.y;
      const leashDistance = Math.hypot(dx, dy);
      if (leashDistance > spec.leash) {
        desiredX = player.x + (dx / leashDistance) * spec.leash;
        desiredY = player.y + (dy / leashDistance) * spec.leash;
      }
    }
  } else {
    const angle = escortAngle(world, index, spec);
    desiredX = player.x + Math.cos(angle) * spec.escortRadius;
    desiredY = player.y + Math.sin(angle) * spec.escortRadius;
  }

  desiredX = clamp(desiredX, bounds.left + 18, bounds.right - 18);
  desiredY = clamp(desiredY, bounds.top + 18, bounds.bottom - 18);

  if (holding) {
    const damping = Math.exp(-7 * dt);
    funnel.vx *= damping;
    funnel.vy *= damping;
  } else {
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
 * The training dummy is deliberately excluded: the funnels would otherwise
 * camp the start room and plink it forever. Test their output in the test room.
 */
function isTargetable(world: GameWorld, enemy: Enemy) {
  if (enemy.dead || enemy.dummy) return false;
  return inRoom(world, enemy.x, enemy.y);
}

/** Prefer an enemy nobody else is shooting at, then let the drones share. */
function pickTarget(
  world: GameWorld,
  funnel: Funnel,
  taken: Set<number>,
): Enemy | null {
  const unclaimed = nearestTarget(world, funnel, true, taken);
  return unclaimed ?? nearestTarget(world, funnel, false, taken);
}

function nearestTarget(
  world: GameWorld,
  funnel: Funnel,
  skipTaken: boolean,
  taken: Set<number>,
): Enemy | null {
  const player = world.player;
  let best: Enemy | null = null;
  let bestScore = Infinity;
  for (const enemy of world.enemies) {
    if (!isTargetable(world, enemy)) continue;
    if (skipTaken && taken.has(enemy.id)) continue;
    // Slight bias toward enemies near the player so the drones do not all
    // run to the far corner of the room.
    const score =
      dist(funnel.x, funnel.y, enemy.x, enemy.y) +
      dist(player.x, player.y, enemy.x, enemy.y) * 0.3;
    if (score < bestScore) {
      bestScore = score;
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
  let wantX = 0;
  let wantY = 0;
  if (distance > 6) {
    wantX = (dx / distance) * spec.droneSpeed;
    wantY = (dy / distance) * spec.droneSpeed;
  }
  const dvx = wantX - funnel.vx;
  const dvy = wantY - funnel.vy;
  const dv = Math.hypot(dvx, dvy);
  const maxDv = spec.droneAccel * dt;
  if (dv > maxDv && dv > 0.0001) {
    funnel.vx += (dvx / dv) * maxDv;
    funnel.vy += (dvy / dv) * maxDv;
  } else {
    funnel.vx = wantX;
    funnel.vy = wantY;
  }
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
      // Idle and parked: face outward from the player, like a sentry.
      const player = world.player;
      want = Math.atan2(funnel.y - player.y, funnel.x - player.x);
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
