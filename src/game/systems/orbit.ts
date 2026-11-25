/** Orbit guards: radius, spin-up and contact damage. */

import { TAU, dist } from '../core/math';
import type { GameWorld } from '../core/world';
import type { WeaponSpec } from '../weapons';
import { damageEnemy } from './damage';
import { spawnBurst } from './fx';

/**
 * Orbit weapon: the balls circle the player at a body's width, spinning out
 * to the seeker's 240px reach while the trigger is held. A single press
 * refills a one-second spin-up, so holding and tapping every second
 * play the same. In both states a ball hurts any enemy it touches (with a
 * per-enemy interval) and erases enemy bullets.
 */
export function updateOrbit(world: GameWorld, dt: number, firing: boolean, weapon: WeaponSpec) {
  const spec = weapon.orbit;
  if (!spec) return;
  const player = world.player;

  world.orbitActive = firing
    ? spec.sustain
    : Math.max(0, world.orbitActive - dt);
  const want = world.orbitActive > 0 ? 1 : 0;
  if (want > world.orbitExpand) {
    world.orbitExpand = Math.min(want, world.orbitExpand + dt / spec.expandTime);
  } else {
    world.orbitExpand = Math.max(want, world.orbitExpand - dt / spec.contractTime);
  }
  // Smoothstep so the balls visibly pick up speed as they move out.
  const e = world.orbitExpand;
  const eased = e * e * (3 - 2 * e);
  const radius =
    spec.idleRadius + (spec.maxRadius - spec.idleRadius) * eased;
  const spin = spec.idleSpeed + (spec.activeSpeed - spec.idleSpeed) * eased;
  world.orbitRadius = radius;
  world.orbitAngle = (world.orbitAngle + spin * dt) % TAU;

  for (const enemy of world.enemies) {
    if (enemy.orbitCooldown > 0) {
      enemy.orbitCooldown = Math.max(0, enemy.orbitCooldown - dt);
    }
  }

  for (let i = 0; i < spec.count; i++) {
    const angle = world.orbitAngle + (i * TAU) / spec.count;
    const ox = player.x + Math.cos(angle) * radius;
    const oy = player.y + Math.sin(angle) * radius;

    for (const enemy of world.enemies) {
      if (enemy.dead || enemy.orbitCooldown > 0) continue;
      if (dist(ox, oy, enemy.x, enemy.y) > enemy.radius + spec.ballRadius) {
        continue;
      }
      enemy.orbitCooldown = spec.hitInterval;
      damageEnemy(world, enemy, weapon.damage, ox, oy, true);
      spawnBurst(world, ox, oy, weapon.color, 3, 110, 0.22);
    }

    for (let j = world.enemyBullets.length - 1; j >= 0; j--) {
      const bullet = world.enemyBullets[j];
      if (dist(ox, oy, bullet.x, bullet.y) > bullet.radius + spec.ballRadius) {
        continue;
      }
      spawnBurst(world, bullet.x, bullet.y, weapon.color, 3, 90, 0.2);
      world.enemyBullets.splice(j, 1);
    }
  }
}
