import { FLAME_TICK } from '../core/config';
import { angleDelta, clamp, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import type { WeaponSpec } from '../weapons';
import { WEAPONS } from '../weapons';
import { damageEnemy } from './damage';

/**
 * Flamer: no projectiles, just a damage tick over the forward cone. Ticks
 * are fixed in game time, so the DPS stays the same on any frame rate.
 */
export function updateFlamer(world: GameWorld, dt: number) {
  const player = world.player;
  const spec = WEAPONS[player.weapon];
  const range = spec.range ?? 240;
  const half = spec.cone ?? 0.4;
  player.muzzle = 0.1;
  player.muzzleColor = spec.color;

  world.flameTick -= dt;
  while (world.flameTick <= 0) {
    world.flameTick += FLAME_TICK;
    burnFlamerCone(world, spec, range, half);
    spawnFlamerParticles(world, spec, range, half);
    world.sfx.play('flame');
  }
}

export function burnFlamerCone(
  world: GameWorld,
  spec: WeaponSpec,
  range: number,
  half: number,
) {
  const player = world.player;
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > range + enemy.radius) continue;
    const spread = Math.abs(angleDelta(player.angle, Math.atan2(dy, dx)));
    const edge = half + Math.atan2(enemy.radius, Math.max(1, distance));
    if (spread > edge) continue;
    // Quiet damage: a per-frame hit burst and sound would flood the screen.
    damageEnemy(world, enemy, spec.damage, enemy.x, enemy.y, true);
  }
}

export function spawnFlamerParticles(
  world: GameWorld,
  spec: WeaponSpec,
  range: number,
  half: number,
) {
  const player = world.player;
  const colors = ['#fff3cf', '#ffd166', '#ff9a4d', spec.color];
  for (let i = 0; i < 8; i++) {
    const angle = player.angle + rand(-half, half) * rand(0.35, 1);
    const distance = rand(16, range * 0.96);
    const heat = clamp(
      Math.floor((distance / range) * colors.length),
      0,
      colors.length - 1,
    );
    const outward = rand(60, 220);
    world.particles.push({
      x: player.x + Math.cos(angle) * distance,
      y: player.y + Math.sin(angle) * distance,
      vx: Math.cos(angle) * outward + rand(-35, 35),
      vy: Math.sin(angle) * outward + rand(-35, 35),
      life: rand(0.08, 0.22),
      maxLife: 0.22,
      size: rand(2.5, 7),
      color: colors[heat],
      drag: 4.5,
    });
  }
  // White-hot puff right at the nozzle.
  for (let i = 0; i < 2; i++) {
    const angle = player.angle + rand(-half * 0.5, half * 0.5);
    world.particles.push({
      x: player.x + Math.cos(angle) * 24,
      y: player.y + Math.sin(angle) * 24,
      vx: Math.cos(angle) * rand(120, 260),
      vy: Math.sin(angle) * rand(120, 260),
      life: rand(0.06, 0.14),
      maxLife: 0.14,
      size: rand(3, 6),
      color: '#ffffff',
      drag: 5,
    });
  }
}
