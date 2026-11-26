/**
 * Cooperative escort funnels: two drones trail the player, and while the
 * trigger is held they all shoot the player's current auto-target. They never
 * choose targets on their own and never fly out to the enemy.
 */

import type { Enemy, Funnel } from '../core/entities';
import { TAU, angleDelta, clamp, dist, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import { WEAPONS, type WeaponSpec } from '../weapons';
import { spawnBurst } from './fx';
import { roomBounds } from './world';

const SLOT_MARGIN = 18;
const SLOT_STEP = 0.35;

export function updateCoopFunnels(world: GameWorld, dt: number) {
  const weapon = WEAPONS[world.player.weapon];
  const spec = weapon.coopFunnel;
  if (!spec) {
    if (world.funnels.length > 0) world.funnels.length = 0;
    return;
  }
  if (world.player.dead) {
    if (world.funnels.length > 0) world.funnels.length = 0;
    return;
  }

  ensureFunnels(world, weapon, spec);
  const target = playerTarget(world);
  const slots: { x: number; y: number }[] = [];
  for (let i = 0; i < world.funnels.length; i++) {
    slots.push(findFollowSlot(world, i, target, slots, spec));
  }
  for (let i = 0; i < world.funnels.length; i++) {
    updateFunnel(world, world.funnels[i], target, slots[i], dt, weapon, spec);
  }
}

/** The player's current lock, but only while the trigger is actually held. */
function playerTarget(world: GameWorld): Enemy | null {
  const firing =
    world.input.fireKey || world.input.touchFire || world.input.padFire;
  if (!firing) return null;
  const target = world.autoTarget;
  return target && !target.dead ? target : null;
}

function ensureFunnels(
  world: GameWorld,
  weapon: WeaponSpec,
  spec: NonNullable<WeaponSpec['coopFunnel']>,
) {
  while (world.funnels.length < spec.count) {
    const index = world.funnels.length;
    const slot = findFollowSlot(world, index, null, [], spec);
    world.funnels.push({
      x: slot.x,
      y: slot.y,
      vx: 0,
      vy: 0,
      angle: escortAngle(world, index, spec),
      cooldown: 0.25,
      muzzle: 0,
      // The autonomous funnel uses these; the cooperative pair ignores them.
      targetId: null,
      phase: 'chase',
      timer: 0,
      seed: rand(0, TAU),
    });
    spawnBurst(world, slot.x, slot.y, weapon.color, 6, 100, 0.28);
  }
}

/** Behind the player's movement (or facing), split left/right. */
function escortAngle(
  world: GameWorld,
  index: number,
  spec: NonNullable<WeaponSpec['coopFunnel']>,
) {
  const player = world.player;
  const moving = Math.hypot(player.vx, player.vy) > 40;
  const base = moving ? Math.atan2(player.vy, player.vx) : player.angle;
  const offset =
    spec.count > 1
      ? (index / (spec.count - 1) - 0.5) * 2 * spec.followSpread
      : 0;
  return base + Math.PI + offset;
}

/**
 * Pick a slot near the player. If the preferred spot is outside the room (or
 * inside future cover) the search fans out around the player until it finds an
 * open one. When the player is engaging, prefer a slot with a clean line to
 * the shared target.
 */
function findFollowSlot(
  world: GameWorld,
  index: number,
  target: Enemy | null,
  claimed: { x: number; y: number }[],
  spec: NonNullable<WeaponSpec['coopFunnel']>,
): { x: number; y: number } {
  const base = escortAngle(world, index, spec);
  if (target) {
    const withShot = searchSlot(world, base, target, claimed, true, spec);
    if (withShot) return withShot;
  }
  const any = searchSlot(world, base, target, claimed, false, spec);
  if (any) return any;
  return fallbackSlot(world, spec);
}

function searchSlot(
  world: GameWorld,
  base: number,
  target: Enemy | null,
  claimed: { x: number; y: number }[],
  needShot: boolean,
  spec: NonNullable<WeaponSpec['coopFunnel']>,
): { x: number; y: number } | null {
  const player = world.player;
  const radii = [spec.followRadius, spec.followRadius + 24, spec.followRadius + 48];
  for (const radius of radii) {
    if (radius > spec.followMaxRadius) break;
    for (let i = 0; i <= 18; i++) {
      const offset =
        i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2) * SLOT_STEP;
      const angle = base + offset;
      const x = player.x + Math.cos(angle) * radius;
      const y = player.y + Math.sin(angle) * radius;
      if (!isOpenSlot(world, x, y)) continue;
      if (
        claimed.some(
          (slot) => dist(slot.x, slot.y, x, y) < spec.followSeparation,
        )
      ) {
        continue;
      }
      if (needShot && target && !hasClearShotAt(world, x, y, target.x, target.y)) {
        continue;
      }
      return { x, y };
    }
  }
  return null;
}

function fallbackSlot(
  world: GameWorld,
  spec: NonNullable<WeaponSpec['coopFunnel']>,
): { x: number; y: number } {
  const player = world.player;
  const bounds = roomBounds(world);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const angle = Math.atan2(centerY - player.y, centerX - player.x);
  return {
    x: clamp(
      player.x + Math.cos(angle) * spec.followRadius,
      bounds.left + SLOT_MARGIN,
      bounds.right - SLOT_MARGIN,
    ),
    y: clamp(
      player.y + Math.sin(angle) * spec.followRadius,
      bounds.top + SLOT_MARGIN,
      bounds.bottom - SLOT_MARGIN,
    ),
  };
}

function updateFunnel(
  world: GameWorld,
  funnel: Funnel,
  target: Enemy | null,
  slot: { x: number; y: number },
  dt: number,
  weapon: WeaponSpec,
  spec: NonNullable<WeaponSpec['coopFunnel']>,
) {
  funnel.cooldown = Math.max(0, funnel.cooldown - dt);
  funnel.muzzle = Math.max(0, funnel.muzzle - dt);

  const bounds = roomBounds(world);
  const desiredX = clamp(
    slot.x,
    bounds.left + SLOT_MARGIN,
    bounds.right - SLOT_MARGIN,
  );
  const desiredY = clamp(
    slot.y,
    bounds.top + SLOT_MARGIN,
    bounds.bottom - SLOT_MARGIN,
  );
  steerTo(funnel, desiredX, desiredY, dt, spec);
  funnel.x += funnel.vx * dt;
  funnel.y += funnel.vy * dt;
  confineFunnel(funnel, bounds);

  aimFunnel(world, funnel, target, dt, spec, weapon);
  if (target) fireFunnel(world, funnel, target, weapon, spec);
}

/** No inertia: fly straight at the slot and stop dead when it is reached. */
function steerTo(
  funnel: Funnel,
  x: number,
  y: number,
  dt: number,
  spec: NonNullable<WeaponSpec['coopFunnel']>,
) {
  const dx = x - funnel.x;
  const dy = y - funnel.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    funnel.vx = 0;
    funnel.vy = 0;
    return;
  }
  const speed = Math.min(spec.droneSpeed, distance / Math.max(dt, 0.001));
  funnel.vx = (dx / distance) * speed;
  funnel.vy = (dy / distance) * speed;
}

function confineFunnel(
  funnel: Funnel,
  bounds: ReturnType<typeof roomBounds>,
) {
  if (funnel.x < bounds.left + SLOT_MARGIN) {
    funnel.x = bounds.left + SLOT_MARGIN;
    funnel.vx = Math.max(0, funnel.vx);
  } else if (funnel.x > bounds.right - SLOT_MARGIN) {
    funnel.x = bounds.right - SLOT_MARGIN;
    funnel.vx = Math.min(0, funnel.vx);
  }
  if (funnel.y < bounds.top + SLOT_MARGIN) {
    funnel.y = bounds.top + SLOT_MARGIN;
    funnel.vy = Math.max(0, funnel.vy);
  } else if (funnel.y > bounds.bottom - SLOT_MARGIN) {
    funnel.y = bounds.bottom - SLOT_MARGIN;
    funnel.vy = Math.min(0, funnel.vy);
  }
}

function aimFunnel(
  world: GameWorld,
  funnel: Funnel,
  target: Enemy | null,
  dt: number,
  spec: NonNullable<WeaponSpec['coopFunnel']>,
  weapon: WeaponSpec,
) {
  let want = funnel.angle;
  if (target) {
    const distance = dist(funnel.x, funnel.y, target.x, target.y);
    const lead = Math.min(spec.leadTime, distance / weapon.speed);
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
  target: Enemy,
  weapon: WeaponSpec,
  spec: NonNullable<WeaponSpec['coopFunnel']>,
) {
  if (funnel.cooldown > 0) return;
  if (!hasClearShotAt(world, funnel.x, funnel.y, target.x, target.y)) return;

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

/** Both endpoints are in the current room. No interior cover exists yet. */
function hasClearShotAt(
  world: GameWorld,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  return inRoom(world, x1, y1, 0) && inRoom(world, x2, y2, 0);
}

function isOpenSlot(world: GameWorld, x: number, y: number) {
  return inRoom(world, x, y, SLOT_MARGIN);
}

function inRoom(world: GameWorld, x: number, y: number, margin: number) {
  const bounds = roomBounds(world);
  return (
    x >= bounds.left + margin &&
    x <= bounds.right - margin &&
    y >= bounds.top + margin &&
    y <= bounds.bottom - margin
  );
}
