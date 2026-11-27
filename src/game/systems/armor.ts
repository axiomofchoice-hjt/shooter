/** Armor behaviours that live outside the hull: the orbiting deflector. */

import { armorOf } from '../armors';
import { angleDelta, clamp } from '../core/math';
import type { GameWorld } from '../core/world';
import { spawnBurst } from './fx';

/**
 * Deflector armor: a shield arc hangs near the hull. It points straight at the
 * nearest enemy bullet — the arc parks between the hull and that bullet — and
 * turns fast enough to catch most shots. Breaking a bullet freezes its
 * steering for `lockTime` seconds; a frozen arc still erases anything that
 * touches it, it just cannot re-aim.
 */
export function updateArmor(world: GameWorld, dt: number) {
  const player = world.player;
  if (player.dead) return;
  const spec = armorOf(player.armor);
  player.armorFlash = Math.max(0, player.armorFlash - dt * 4);
  player.armorLock = Math.max(0, player.armorLock - dt);

  const orb = spec.orb;
  if (!orb) return;

  // Aim: only the nearest bullet in range matters, and the arc simply faces
  // it, so the shield sits between the hull and the incoming shot.
  if (player.armorLock <= 0) {
    const target = nearestBullet(world, orb.scanRadius);
    if (target) {
      const want = Math.atan2(target.y - player.y, target.x - player.x);
      const maxTurn = orb.turnRate * dt;
      player.armorAngle += clamp(angleDelta(player.armorAngle, want), -maxTurn, maxTurn);
    }
  }

  // Block: runs even while the steering is frozen.
  const ready = player.armorLock <= 0;
  let broken = 0;
  for (let i = world.enemyBullets.length - 1; i >= 0; i--) {
    const bullet = world.enemyBullets[i];
    const dx = bullet.x - player.x;
    const dy = bullet.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (Math.abs(distance - orb.orbitRadius) > orb.width / 2 + bullet.radius) {
      continue;
    }
    const reach = orb.halfAngle + bullet.radius / Math.max(1, distance);
    if (Math.abs(angleDelta(player.armorAngle, Math.atan2(dy, dx))) > reach) {
      continue;
    }
    world.enemyBullets.splice(i, 1);
    spawnBurst(world, bullet.x, bullet.y, spec.color, 4, 120, 0.22);
    broken += 1;
  }
  if (broken === 0) return;
  player.armorLock = orb.lockTime;
  player.armorFlash = 1;
  world.shake = Math.max(world.shake, 1.6);
  if (ready) world.sfx.play('shield');
}

/** Closest ordinary enemy bullet inside the scan radius. */
function nearestBullet(world: GameWorld, range: number) {
  const player = world.player;
  let best: (typeof world.enemyBullets)[number] | null = null;
  let bestDistance = range;
  for (const bullet of world.enemyBullets) {
    const distance = Math.hypot(bullet.x - player.x, bullet.y - player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = bullet;
    }
  }
  return best;
}
