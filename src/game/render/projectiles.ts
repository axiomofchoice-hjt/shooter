/** Bullets, missiles and shockwaves. */

import type { Bullet } from '../core/entities';
import { TAU, clamp, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';

export function drawBullets(world: GameWorld) {
  const ctx = world.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const bullet of world.bullets) {
    if (bullet.missile || bullet.recycle) {
      drawMissile(world, bullet);
      continue;
    }
    if (bullet.shock) {
      drawShockShot(world, bullet);
      continue;
    }
    const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
    const tailLength = bullet.split
      ? 42
      : bullet.pierce > 0 || bullet.hitIds.length > 0
        ? 62
        : 27;
    const tailX = bullet.x - (bullet.vx / speed) * tailLength;
    const tailY = bullet.y - (bullet.vy / speed) * tailLength;
    ctx.strokeStyle = withAlpha(bullet.color, 0.22);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(bullet.color, 0.9);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.split ? 4.6 : 2.8, 0, TAU);
    ctx.fill();
    if (bullet.split) {
      ctx.strokeStyle = withAlpha(bullet.color, 0.75);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius + 3, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Lightning dart: fast trailing shard that hovers after its glide. */
export function drawStormDarts(world: GameWorld) {
  if (!world.stormDarts.length) return;
  const ctx = world.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const dart of world.stormDarts) {
    const fade =
      dart.age > dart.life - 0.25
        ? clamp((dart.life - dart.age) / 0.25, 0, 1)
        : 1;

    // Static AOE range indicator; the zap itself is only the arcs/sparks.
    ctx.strokeStyle = withAlpha(dart.color, 0.3 * fade);
    ctx.lineWidth = 1.4 / world.zoom;
    ctx.setLineDash([9, 12]);
    ctx.beginPath();
    ctx.arc(dart.x, dart.y, dart.aoeRadius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = withAlpha(dart.color, 0.025 * fade);
    ctx.fill();

    const speed =
      dart.age < dart.fastTime
        ? dart.startSpeed +
          ((dart.glideSpeed - dart.startSpeed) * dart.age) / dart.fastTime
        : dart.glideSpeed;
    const trailLength = 16 + Math.min(1, speed / 600) * 58;
    const tailX = dart.x - dart.dirX * trailLength;
    const tailY = dart.y - dart.dirY * trailLength;
    const trail = ctx.createLinearGradient(tailX, tailY, dart.x, dart.y);
    trail.addColorStop(0, withAlpha(dart.color, 0));
    trail.addColorStop(1, withAlpha(dart.color, 0.42 * fade));
    ctx.strokeStyle = trail;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(dart.x, dart.y);
    ctx.stroke();

    const charge = clamp(
      (dart.age % dart.pulseInterval) / dart.pulseInterval,
      0,
      1,
    );
    ctx.save();
    ctx.translate(dart.x, dart.y);
    ctx.strokeStyle = withAlpha(dart.color, (0.22 + charge * 0.45) * fade);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 13 + charge * 5, 0, TAU);
    ctx.stroke();
    ctx.rotate(dart.age * 8 + dart.seed);
    ctx.fillStyle = withAlpha(dart.color, 0.32 * fade);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = withAlpha(dart.color, 0.95 * fade);
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(0, 3.2);
    ctx.lineTo(-9, 0);
    ctx.lineTo(0, -3.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * fade})`;
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Concussion shell: a glowing orb with a spinning containment ring. */
function drawShockShot(world: GameWorld, bullet: Bullet) {
  const ctx = world.ctx;
  const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
  const dirX = bullet.vx / speed;
  const dirY = bullet.vy / speed;
  const pulse = 1 + Math.sin(world.ambientTime * 20 + bullet.x * 0.02) * 0.12;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(bullet.color, 0.28);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(bullet.x - dirX * 26, bullet.y - dirY * 26);
  ctx.lineTo(bullet.x, bullet.y);
  ctx.stroke();
  ctx.translate(bullet.x, bullet.y);
  ctx.fillStyle = withAlpha(bullet.color, 0.18);
  ctx.beginPath();
  ctx.arc(0, 0, 18 * pulse, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = withAlpha(bullet.color, 0.55);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 11 * pulse, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = bullet.color;
  ctx.beginPath();
  ctx.arc(0, 0, bullet.radius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-1.5, -1.5, 3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Expanding rings left by a concussion shell. */
export function drawShockwaves(world: GameWorld) {
  if (!world.shockwaves.length) return;
  const ctx = world.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const wave of world.shockwaves) {
    const t = clamp(1 - wave.life / wave.maxLife, 0, 1);
    const radius = wave.maxRadius * (1 - Math.pow(1 - t, 2));
    const fade = 1 - t;
    const glow = ctx.createRadialGradient(
      wave.x,
      wave.y,
      0,
      wave.x,
      wave.y,
      Math.max(1, radius),
    );
    glow.addColorStop(0, withAlpha(wave.color, 0.22 * fade));
    glow.addColorStop(0.6, withAlpha(wave.color, 0.1 * fade));
    glow.addColorStop(1, withAlpha(wave.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, radius, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = withAlpha(wave.color, 0.95 * fade);
    ctx.lineWidth = 11 * fade + 2;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, radius, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * fade})`;
    ctx.lineWidth = 2.5 * fade + 1;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, radius * 0.82, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(wave.color, 0.5 * fade);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, radius * 0.55, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** Seeker missile: curved trail plus a small arrowhead pointing where it flies. */
function drawMissile(world: GameWorld, bullet: Bullet) {
  const ctx = world.ctx;
  const trail = bullet.trail ?? [];
  if (trail.length > 1) {
    ctx.strokeStyle = withAlpha(bullet.color, 0.16);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(bullet.color, 0.55);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
  }
  const angle = Math.atan2(bullet.vy, bullet.vx);
  ctx.save();
  ctx.translate(bullet.x, bullet.y);
  if (bullet.recycle) {
    // Spinning salvage halo, so the bolt reads differently from the seeker.
    ctx.save();
    ctx.rotate(world.ambientTime * 3.2);
    ctx.strokeStyle = withAlpha(bullet.color, 0.8);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU * 0.72);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  ctx.rotate(angle);
  ctx.fillStyle = withAlpha(bullet.color, 0.35);
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = bullet.color;
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-4, 4.5);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-4, -4.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(1, 0, 2.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawEnemyBullets(world: GameWorld) {
  const ctx = world.ctx;
  for (const bullet of world.enemyBullets) {
    const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
    ctx.save();
    ctx.strokeStyle = withAlpha(bullet.color, 0.35);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(
      bullet.x - (bullet.vx / speed) * 22,
      bullet.y - (bullet.vy / speed) * 22,
    );
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius * 0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

export function drawShells(world: GameWorld) {
  const ctx = world.ctx;
  if (!world.shells.length) return;
  for (const shell of world.shells) {
    // Target reticle stays at the aim point, so moving away visibly dodges it.
    const t = clamp(shell.traveled / Math.max(1, shell.total), 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.2 + t * 0.55;
    ctx.strokeStyle = withAlpha(shell.color, 0.75);
    ctx.lineWidth = 1.3;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(shell.targetX, shell.targetY, 17 + Math.sin(world.elapsed * 7) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(shell.targetX - 24, shell.targetY);
    ctx.lineTo(shell.targetX - 12, shell.targetY);
    ctx.moveTo(shell.targetX + 12, shell.targetY);
    ctx.lineTo(shell.targetX + 24, shell.targetY);
    ctx.moveTo(shell.targetX, shell.targetY - 24);
    ctx.lineTo(shell.targetX, shell.targetY - 12);
    ctx.moveTo(shell.targetX, shell.targetY + 12);
    ctx.lineTo(shell.targetX, shell.targetY + 24);
    ctx.stroke();
    ctx.restore();

    const speed = Math.hypot(shell.vx, shell.vy) || 1;
    ctx.save();
    ctx.translate(shell.x, shell.y);

    // Comet tail.
    ctx.strokeStyle = withAlpha(shell.color, 0.4);
    ctx.lineWidth = shell.radius * 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-(shell.vx / speed) * 26, -(shell.vy / speed) * 26);
    ctx.lineTo(0, 0);
    ctx.stroke();

    // Glow.
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, shell.radius * 3.2);
    glow.addColorStop(0, withAlpha(shell.color, 0.5));
    glow.addColorStop(1, withAlpha(shell.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, shell.radius * 3.2, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.rotate(shell.spin);
    ctx.fillStyle = 'rgba(34, 14, 4, 0.92)';
    ctx.strokeStyle = shell.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, shell.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Orbiting arc that hints at the ring it will burst into.
    ctx.strokeStyle = withAlpha('#ffffff', 0.55);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, shell.radius + 6, 0, TAU * 0.62);
    ctx.stroke();

    ctx.fillStyle = '#fff1e0';
    ctx.beginPath();
    ctx.arc(0, 0, shell.radius * 0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

export function drawHomings(world: GameWorld) {
  const ctx = world.ctx;
  if (!world.homings.length) return;
  for (const missile of world.homings) {
    const seeking = missile.seek > 0;
    // Locked missiles keep their hot colour; without a lock they go grey,
    // which is the cue that the next move just has to be a sidestep.
    const color = seeking ? missile.color : '#c1b2bd';

    // Curved smoke trail. Dashed while seeking, straight once the lock drops,
    // which is the main read for "it stopped following me".
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 1; i < missile.trail.length; i++) {
      const a = missile.trail[i - 1];
      const b = missile.trail[i];
      const t = i / Math.max(1, missile.trail.length - 1);
      ctx.strokeStyle = withAlpha(color, t * (seeking ? 0.42 : 0.24));
      ctx.lineWidth = 1 + t * 5.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(
      missile.x,
      missile.y,
      1,
      missile.x,
      missile.y,
      missile.radius * 3.4,
    );
    glow.addColorStop(0, withAlpha(color, seeking ? 0.55 : 0.3));
    glow.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(missile.x, missile.y, missile.radius * 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(missile.x, missile.y);
    ctx.rotate(missile.angle);
    ctx.beginPath();
    ctx.moveTo(missile.radius * 2, 0);
    ctx.lineTo(-missile.radius * 1.1, missile.radius * 0.9);
    ctx.lineTo(-missile.radius * 0.45, 0);
    ctx.lineTo(-missile.radius * 1.1, -missile.radius * 0.9);
    ctx.closePath();
    ctx.fillStyle = withAlpha(color, 0.82);
    ctx.fill();
    ctx.strokeStyle = seeking ? '#ffffff' : withAlpha(color, 0.5);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = seeking ? '#ffffff' : '#f2e9f7';
    ctx.beginPath();
    ctx.arc(0, 0, missile.radius * 0.38, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (seeking) {
      // Dashed seeker ring spins only while the missile still has a lock.
      ctx.save();
      ctx.translate(missile.x, missile.y);
      ctx.strokeStyle = withAlpha('#ffffff', 0.6);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, missile.radius + 6, missile.spin, missile.spin + TAU * 0.7);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

export function drawBlasts(world: GameWorld) {
  if (!world.blasts.length) return;
  const ctx = world.ctx;
  for (const blast of world.blasts) {
    const t = 1 - blast.life / blast.maxLife;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(blast.color, (1 - t) * 0.9);
    ctx.lineWidth = 3.6 * (1 - t) + 0.6;
    ctx.beginPath();
    ctx.arc(blast.x, blast.y, blast.radius * (0.35 + t * 0.9), 0, TAU);
    ctx.stroke();
    ctx.fillStyle = withAlpha('#ffffff', (1 - t) * 0.18);
    ctx.beginPath();
    ctx.arc(blast.x, blast.y, blast.radius * (0.85 - t * 0.7), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
