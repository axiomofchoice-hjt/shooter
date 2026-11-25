/** Particles, floaters and short-lived visual effects. */

import { TAU, rand } from '../core/math';
import type { GameWorld } from '../core/world';

// ---------------------------------------------------------------------- fx
export function spawnBurst(
  world: GameWorld,
  x: number,
  y: number,
  color: string,
  count: number,
  speed: number,
  life: number,
) {
  if (world.particles.length > 320) return;
  for (let i = 0; i < count; i++) {
    const angle = rand(0, TAU);
    const velocity = rand(speed * 0.25, speed);
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: rand(life * 0.35, life),
      maxLife: life,
      size: rand(1.4, 4.4),
      color,
      drag: rand(2, 5),
    });
  }
}

export function updateFx(world: GameWorld, dt: number) {
  updateParticles(world, dt);
  for (let i = world.blasts.length - 1; i >= 0; i--) {
    world.blasts[i].life -= dt;
    if (world.blasts[i].life <= 0) world.blasts.splice(i, 1);
  }
  for (let i = world.arcs.length - 1; i >= 0; i--) {
    world.arcs[i].life -= dt;
    if (world.arcs[i].life <= 0) world.arcs.splice(i, 1);
  }
  for (let i = world.shockwaves.length - 1; i >= 0; i--) {
    world.shockwaves[i].life -= dt;
    if (world.shockwaves[i].life <= 0) world.shockwaves.splice(i, 1);
  }
  for (let i = world.laserBeams.length - 1; i >= 0; i--) {
    world.laserBeams[i].life -= dt;
    if (world.laserBeams[i].life <= 0) world.laserBeams.splice(i, 1);
  }
  for (let i = world.ghosts.length - 1; i >= 0; i--) {
    world.ghosts[i].life -= dt;
    if (world.ghosts[i].life <= 0) world.ghosts.splice(i, 1);
  }
  world.dashRing.life = Math.max(0, world.dashRing.life - dt);
  world.dashFlash = Math.max(0, world.dashFlash - dt);
  world.dashTrail.life = Math.max(0, world.dashTrail.life - dt);
  updateFloaters(world, dt);
  if (world.banner) {
    world.banner.time -= dt;
    if (world.banner.time <= 0) world.banner = null;
  }
  world.comboTimer = Math.max(0, world.comboTimer - dt);
  if (world.comboTimer <= 0) world.combo = 0;
}

export function updateParticles(world: GameWorld, dt: number) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const particle = world.particles[i];
    particle.life -= dt;
    if (particle.life <= 0) {
      world.particles.splice(i, 1);
      continue;
    }
    const damping = Math.exp(-particle.drag * dt);
    particle.vx *= damping;
    particle.vy *= damping;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
  }
}

export function updateFloaters(world: GameWorld, dt: number) {
  for (let i = world.floaters.length - 1; i >= 0; i--) {
    const floater = world.floaters[i];
    floater.life -= dt;
    floater.y -= 32 * dt;
    if (floater.life <= 0) world.floaters.splice(i, 1);
  }
}
