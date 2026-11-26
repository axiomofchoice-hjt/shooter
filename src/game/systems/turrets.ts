/** Sentry turrets summoned by the hive gun. */

import type { Enemy, Turret } from '../core/entities';
import { TAU, clamp, dist, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import { TURRET } from '../weapons';
import { spawnBurst } from './fx';
import { findNearestEnemy, roomBounds } from './world';

// ------------------------------------------------------------------ turrets

/**
 * Hive gun bookkeeping: every few hits on one enemy — or any kill — plants a
 * turret beside that enemy. A kill takes priority so one hit can never both
 * trigger the counter and "kill summon" into two turrets.
 */
export function registerSummonHit(
  world: GameWorld,
  enemy: Enemy,
  every: number,
  color: string,
) {
  if (enemy.dead) {
    summonTurret(world, enemy.x, enemy.y, enemy.radius, color);
    return;
  }
  enemy.summonHits += 1;
  if (enemy.summonHits < every) return;
  enemy.summonHits = 0;
  summonTurret(world, enemy.x, enemy.y, enemy.radius, color);
}

/** Plants a turret one body away from the enemy, always inside the room. */
function summonTurret(
  world: GameWorld,
  x: number,
  y: number,
  enemyRadius: number,
  color: string,
) {
  const bounds = roomBounds(world);
  const gap = enemyRadius + TURRET.radius + TURRET.spawnGap;
  const start = rand(0, TAU);
  const margin = TURRET.radius + 12;
  let tx = 0;
  let ty = 0;
  let placed = false;
  for (let i = 0; i < 8; i++) {
    const angle = start + (i / 8) * TAU;
    const px = x + Math.cos(angle) * gap;
    const py = y + Math.sin(angle) * gap;
    if (
      px >= bounds.left + margin &&
      px <= bounds.right - margin &&
      py >= bounds.top + margin &&
      py <= bounds.bottom - margin
    ) {
      tx = px;
      ty = py;
      placed = true;
      break;
    }
  }
  if (!placed) {
    tx = clamp(x + Math.cos(start) * gap, bounds.left + margin, bounds.right - margin);
    ty = clamp(y + Math.sin(start) * gap, bounds.top + margin, bounds.bottom - margin);
  }

  // The partner drone shares this array but does not count toward the hive
  // turret cap; drop the oldest hive turret instead.
  const hive = world.turrets.filter((turret) => !turret.partner);
  if (hive.length >= TURRET.maxCount) {
    const oldest = hive[0];
    const index = world.turrets.indexOf(oldest);
    if (index >= 0) world.turrets.splice(index, 1);
  }
  world.turrets.push({
    id: world.nextTurretId++,
    x: tx,
    y: ty,
    angle: 0,
    hp: TURRET.hp,
    maxHp: TURRET.hp,
    hitFlash: 0,
    cooldown: 0.12,
    life: TURRET.life,
    maxLife: TURRET.life,
    muzzle: 0,
    color,
    seed: rand(0, TAU),
  });
  spawnBurst(world, tx, ty, color, 12, 170, 0.4);
  spawnBurst(world, tx, ty, '#ffffff', 5, 120, 0.25);
  world.shake = Math.max(world.shake, 2);
}

export function turretById(world: GameWorld, id: number | undefined): Turret | null {
  if (id === undefined) return null;
  return world.turrets.find((turret) => turret.id === id) ?? null;
}

/** Nearest live turret or partner drone, regardless of range. */
export function findNearestTurret(world: GameWorld, enemy: Enemy): Turret | null {
  let best: Turret | null = null;
  let bestDist = Infinity;
  for (const turret of world.turrets) {
    const d = dist(enemy.x, enemy.y, turret.x, turret.y);
    if (d < bestDist) {
      bestDist = d;
      best = turret;
    }
  }
  return best;
}

/**
 * Where this enemy's current attack is pointed: the nearest ally chosen when
 * the attack began, or the player once that ally is gone.
 */
export function enemyAttackPoint(world: GameWorld, enemy: Enemy): { x: number; y: number } {
  const turret = turretById(world, enemy.brain.turretId);
  if (turret) return turret;
  enemy.brain.turretId = undefined;
  return world.player;
}

export function updateTurrets(world: GameWorld, dt: number) {
  for (let i = world.turrets.length - 1; i >= 0; i--) {
    const turret = world.turrets[i];
    // The partner drone has its own movement/fire system.
    if (turret.partner) continue;
    turret.life -= dt;
    turret.hitFlash = Math.max(0, turret.hitFlash - dt);
    turret.muzzle = Math.max(0, turret.muzzle - dt);
    turret.cooldown -= dt;
    if (turret.life <= 0) {
      spawnBurst(world, turret.x, turret.y, turret.color, 8, 120, 0.35);
      world.turrets.splice(i, 1);
      continue;
    }

    const target = findNearestEnemy(world, turret.x, turret.y, TURRET.range);
    if (!target) continue;
    // Lead a little so a grunt walking across the ring does not slip out.
    const distance = dist(turret.x, turret.y, target.x, target.y);
    const lead = Math.min(0.25, distance / TURRET.shotSpeed);
    const aimX = target.x + target.vx * lead;
    const aimY = target.y + target.vy * lead;
    turret.angle = Math.atan2(aimY - turret.y, aimX - turret.x);
    if (turret.cooldown > 0) continue;
    turret.cooldown = TURRET.fireInterval;
    turret.muzzle = 0.08;
    const muzzleX = turret.x + Math.cos(turret.angle) * (TURRET.radius + 6);
    const muzzleY = turret.y + Math.sin(turret.angle) * (TURRET.radius + 6);
    world.bullets.push({
      x: muzzleX,
      y: muzzleY,
      prevX: muzzleX,
      prevY: muzzleY,
      vx: Math.cos(turret.angle) * TURRET.shotSpeed,
      vy: Math.sin(turret.angle) * TURRET.shotSpeed,
      radius: TURRET.shotRadius,
      damage: TURRET.damage,
      life: TURRET.shotLife,
      color: turret.color,
      pierce: 0,
      hitIds: [],
    });
  }
}
