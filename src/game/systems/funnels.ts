/**
 * Two escort drones that trail the player. They are companions, not a weapon:
 * they follow in a loose formation and only join the fight while the player is
 * firing, all focusing the player's current auto-target.
 */

import { FUNNEL } from '../core/config';
import type { Enemy, Funnel } from '../core/entities';
import { TAU, angleDelta, clamp, dist, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import { spawnBurst } from './fx';
import { roomBounds } from './world';

const SLOT_MARGIN = 18;
const SLOT_STEP = 0.35;
const SLOT_RADII = [
  FUNNEL.followRadius,
  FUNNEL.followRadius + 24,
  FUNNEL.followRadius + 48,
];

/** Drop every drone: room change, death or run reset. */
export function clearFunnels(world: GameWorld) {
  if (world.funnels.length > 0) world.funnels.length = 0;
}

/**
 * Keep the pair alive and move them with the player. The drones are not a
 * weapon slot and never pick targets on their own: while the trigger is held
 * they all shoot the player's auto-target, and otherwise they simply follow.
 */
export function updateFunnels(world: GameWorld, dt: number) {
  if (world.player.dead) {
    clearFunnels(world);
    return;
  }
  ensureFunnels(world);

  const target = playerTarget(world);
  const slots: { x: number; y: number }[] = [];
  for (let i = 0; i < world.funnels.length; i++) {
    slots.push(findFollowSlot(world, i, target, slots));
  }
  for (let i = 0; i < world.funnels.length; i++) {
    updateFunnel(world, world.funnels[i], target, slots[i], dt);
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

function ensureFunnels(world: GameWorld) {
  while (world.funnels.length < FUNNEL.count) {
    const index = world.funnels.length;
    const slot = findFollowSlot(world, index, null, []);
    world.funnels.push({
      x: slot.x,
      y: slot.y,
      vx: 0,
      vy: 0,
      angle: escortAngle(world, index),
      cooldown: 0.25,
      muzzle: 0,
      seed: rand(0, TAU),
    });
    spawnBurst(world, slot.x, slot.y, FUNNEL.color, 6, 100, 0.28);
  }
}

/** Behind the player's movement (or facing), split left/right. */
function escortAngle(world: GameWorld, index: number) {
  const player = world.player;
  const moving = Math.hypot(player.vx, player.vy) > 40;
  const base = moving ? Math.atan2(player.vy, player.vx) : player.angle;
  const offset =
    FUNNEL.count > 1
      ? (index / (FUNNEL.count - 1) - 0.5) * 2 * FUNNEL.followSpread
      : 0;
  return base + Math.PI + offset;
}

/**
 * Pick a slot near the player. If the preferred spot is outside the room (or
 * inside cover) the search fans out around the player until it finds an open
 * one. When the player is engaging, prefer a slot with a clean line to the
 * shared target.
 */
function findFollowSlot(
  world: GameWorld,
  index: number,
  target: Enemy | null,
  claimed: { x: number; y: number }[],
): { x: number; y: number } {
  const base = escortAngle(world, index);
  if (target) {
    const withShot = searchSlot(world, base, target, claimed, true);
    if (withShot) return withShot;
  }
  const any = searchSlot(world, base, target, claimed, false);
  if (any) return any;
  return fallbackSlot(world);
}

function searchSlot(
  world: GameWorld,
  base: number,
  target: Enemy | null,
  claimed: { x: number; y: number }[],
  needShot: boolean,
): { x: number; y: number } | null {
  const player = world.player;
  for (const radius of SLOT_RADII) {
    if (radius > FUNNEL.followMaxRadius) break;
    for (let i = 0; i <= 18; i++) {
      const offset =
        i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2) * SLOT_STEP;
      const angle = base + offset;
      const x = player.x + Math.cos(angle) * radius;
      const y = player.y + Math.sin(angle) * radius;
      if (!isOpenSlot(world, x, y)) continue;
      if (
        claimed.some(
          (slot) => dist(slot.x, slot.y, x, y) < FUNNEL.followSeparation,
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

function fallbackSlot(world: GameWorld): { x: number; y: number } {
  const player = world.player;
  const bounds = roomBounds(world);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const angle = Math.atan2(centerY - player.y, centerX - player.x);
  return {
    x: clamp(
      player.x + Math.cos(angle) * FUNNEL.followRadius,
      bounds.left + SLOT_MARGIN,
      bounds.right - SLOT_MARGIN,
    ),
    y: clamp(
      player.y + Math.sin(angle) * FUNNEL.followRadius,
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
  steerTo(funnel, desiredX, desiredY, dt);
  funnel.x += funnel.vx * dt;
  funnel.y += funnel.vy * dt;
  confineFunnel(funnel, bounds);

  aimFunnel(world, funnel, target, dt);
  if (target) fireFunnel(world, funnel, target);
}

/** No inertia: fly straight at the slot and stop dead when it is reached. */
function steerTo(funnel: Funnel, x: number, y: number, dt: number) {
  const dx = x - funnel.x;
  const dy = y - funnel.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    funnel.vx = 0;
    funnel.vy = 0;
    return;
  }
  const speed = Math.min(FUNNEL.moveSpeed, distance / Math.max(dt, 0.001));
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
) {
  let want = funnel.angle;
  if (target) {
    const distance = dist(funnel.x, funnel.y, target.x, target.y);
    const lead = Math.min(FUNNEL.leadTime, distance / FUNNEL.bulletSpeed);
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
  const maxTurn = FUNNEL.turnRate * dt;
  funnel.angle += clamp(angleDelta(funnel.angle, want), -maxTurn, maxTurn);
}

function fireFunnel(world: GameWorld, funnel: Funnel, target: Enemy) {
  if (funnel.cooldown > 0) return;
  if (!hasClearShotAt(world, funnel.x, funnel.y, target.x, target.y)) return;

  const distance = dist(funnel.x, funnel.y, target.x, target.y);
  const lead = Math.min(FUNNEL.leadTime, distance / FUNNEL.bulletSpeed);
  const aimX = target.x + target.vx * lead;
  const aimY = target.y + target.vy * lead;
  const want = Math.atan2(aimY - funnel.y, aimX - funnel.x);
  // Wait for the hull to finish turning instead of snapping the shot.
  if (Math.abs(angleDelta(funnel.angle, want)) > 0.2) return;

  funnel.cooldown = FUNNEL.cooldown;
  funnel.muzzle = 0.08;
  const x = funnel.x + Math.cos(funnel.angle) * 12;
  const y = funnel.y + Math.sin(funnel.angle) * 12;
  world.bullets.push({
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(want) * FUNNEL.bulletSpeed,
    vy: Math.sin(want) * FUNNEL.bulletSpeed,
    radius: FUNNEL.bulletRadius,
    damage: FUNNEL.damage,
    // No range expiry: the shot flies until it hits something or leaves the
    // room. A long sight line is still a valid firing line.
    life: Infinity,
    color: FUNNEL.color,
    pierce: 0,
    hitIds: [],
  });
  world.sfx.play('funnel');
  spawnBurst(world, x, y, FUNNEL.color, 2, 55, 0.16);
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
