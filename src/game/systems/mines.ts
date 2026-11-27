/** Mine layer: the ring of mines left around a bullet's impact point. */

import type { Bullet, Enemy, Mine } from '../core/entities';
import { TAU, clamp, dist } from '../core/math';
import type { GameWorld } from '../core/world';
import { damageEnemy } from './damage';
import { spawnBurst } from './fx';
import { roomBounds } from './world';

/**
 * Plants one ring of mines around the point where the shot landed. Mines are
 * spaced evenly and start from a random angle, so the ring does not look
 * stamped. A mine that would land in a wall is pulled back inside the room.
 */
export function plantMineRing(
  world: GameWorld,
  x: number,
  y: number,
  bullet: Bullet,
) {
  const spec = bullet.minefield;
  if (!spec) return;
  const bounds = roomBounds(world);
  const margin = spec.radius + 4;
  const start = Math.random() * TAU;
  for (let i = 0; i < spec.count; i++) {
    const angle = start + (i / spec.count) * TAU;
    const px = clamp(
      x + Math.cos(angle) * spec.ringRadius,
      bounds.left + margin,
      bounds.right - margin,
    );
    const py = clamp(
      y + Math.sin(angle) * spec.ringRadius,
      bounds.top + margin,
      bounds.bottom - margin,
    );
    world.mines.push({
      id: world.nextMineId++,
      x: px,
      y: py,
      // The wind-up line always starts from the actual impact point, so a
      // mine pulled back inside the room still reads as part of the ring.
      originX: x,
      originY: y,
      age: 0,
      delay: spec.spawnDelay,
      life: spec.life,
      surfaced: false,
      triggerRadius: spec.triggerRadius,
      blastRadius: spec.blastRadius,
      blastDamage: spec.blastDamage,
      radius: spec.radius,
      color: bullet.color,
      seed: Math.random() * 100,
    });
  }
  spawnBurst(world, x, y, bullet.color, 10, 170, 0.35);
  world.shake = Math.max(world.shake, 2.2);
}

/**
 * Ages the mines, surfaces them one `delay` after the shot, sets off any
 * surfaced mine an enemy has stepped on, and clears the ones whose lifetime is
 * over. The delay is a real wind-up: nothing is there to touch yet, which is
 * why the renderer shows a moving line instead of the mine itself.
 */
export function updateMines(world: GameWorld, dt: number) {
  for (let i = world.mines.length - 1; i >= 0; i--) {
    const mine = world.mines[i];
    mine.age += dt;
    if (!mine.surfaced) {
      if (mine.age < mine.delay) continue;
      mine.surfaced = true;
      // Surface with a short puff so the pop is readable.
      spawnBurst(world, mine.x, mine.y, mine.color, 6, 90, 0.28);
    }
    if (mine.age >= mine.delay + mine.life) {
      spawnBurst(world, mine.x, mine.y, mine.color, 3, 70, 0.2);
      world.mines.splice(i, 1);
      continue;
    }
    const trigger = findTrigger(world, mine);
    if (!trigger) continue;
    detonateMine(world, mine, trigger);
    world.mines.splice(i, 1);
  }
}

/** First live enemy touching the trigger radius (closest one wins). */
function findTrigger(world: GameWorld, mine: Mine) {
  let closest: Enemy | null = null;
  let closestDistance = Infinity;
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    const distance = dist(mine.x, mine.y, enemy.x, enemy.y);
    if (distance > mine.triggerRadius + enemy.radius) continue;
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = enemy;
    }
  }
  return closest;
}

/**
 * One mine goes off: a 52px blast for 18 damage. The enemy that stepped on it
 * takes the centre hit; the neighbours in range take it too, with a little
 * falloff toward the edge so the trigger target always takes the full value.
 */
function detonateMine(world: GameWorld, mine: Mine, trigger: Enemy) {
  world.shockwaves.push({
    x: mine.x,
    y: mine.y,
    maxRadius: mine.blastRadius * 1.25,
    life: 0.32,
    maxLife: 0.32,
    color: mine.color,
  });
  world.shake = Math.max(world.shake, 5);
  world.sfx.play('blast');
  spawnBurst(world, mine.x, mine.y, mine.color, 16, 240, 0.4);
  spawnBurst(world, mine.x, mine.y, '#ffffff', 8, 170, 0.28);

  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    const distance = dist(mine.x, mine.y, enemy.x, enemy.y);
    if (distance > mine.blastRadius + enemy.radius) continue;
    const falloff =
      enemy.id === trigger.id
        ? 1
        : 1 - clamp(distance / (mine.blastRadius + enemy.radius), 0, 1) * 0.6;
    damageEnemy(world, enemy, mine.blastDamage * falloff, enemy.x, enemy.y, true);
  }
}
