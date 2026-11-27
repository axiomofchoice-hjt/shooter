/** Loot drops and pickup collection. */

import type { Enemy } from '../core/entities';
import { clamp, dist } from '../core/math';
import type { GameWorld } from '../core/world';
import { spawnBurst } from './fx';
import { healPlayer } from './heal';
import { emitHud } from './hud';
import { roomBounds } from './world';

// ------------------------------------------------------------------ pickups
export function maybeDropPickup(world: GameWorld, enemy: Enemy) {
  const chance = enemy.kind === 'tank' ? 0.4 : 0.08;
  if (Math.random() < chance && world.pickups.length < 3) {
    dropPickup(world, enemy.x, enemy.y);
  }
}

export function dropPickup(world: GameWorld, x: number, y: number) {
  const bounds = roomBounds(world);
  world.pickups.push({
    x: clamp(x, bounds.left + 24, bounds.right - 24),
    y: clamp(y, bounds.top + 24, bounds.bottom - 24),
    age: 0,
    life: 24,
  });
}

export function updatePickups(world: GameWorld, dt: number) {
  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const pickup = world.pickups[i];
    pickup.age += dt;
    pickup.life -= dt;
    if (pickup.life <= 0) {
      world.pickups.splice(i, 1);
      continue;
    }
    if (dist(pickup.x, pickup.y, world.player.x, world.player.y) < 38) {
      // Overheal is handled inside healPlayer; the floater only shows what the
      // hull actually regained, so a full-health pickup never lies about HP.
      const heal = healPlayer(world, 25);
      world.healFlash = 1;
      world.pickups.splice(i, 1);
      if (heal.healed > 0) {
        world.floaters.push({
          x: world.player.x,
          y: world.player.y - 34,
          text: `+${heal.healed} HP`,
          color: '#7dff9b',
          life: 1,
          maxLife: 1,
          size: 18,
        });
      }
      spawnBurst(world, pickup.x, pickup.y, '#7dff9b', 16, 160, 0.5);
      world.sfx.play('pickup');
      emitHud(world, true);
    }
  }
}
