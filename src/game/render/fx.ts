import { PLAYER_COLOR } from '../core/config';
import { TAU, clamp, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';

export function drawParticles(world: GameWorld) {
  const ctx = world.ctx;
  if (!world.particles.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const particle of world.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * (0.45 + alpha * 0.55), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function drawFloaters(world: GameWorld) {
  const ctx = world.ctx;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const floater of world.floaters) {
    const alpha = clamp(floater.life / floater.maxLife, 0, 1);
    ctx.globalAlpha = Math.min(1, alpha * 1.8);
    ctx.font = `700 ${floater.size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.restore();
}

export function drawAutoTarget(world: GameWorld) {
  if (!world.autoTarget || world.autoTarget.dead) return;
  const ctx = world.ctx;
  const target = world.autoTarget;
  const radius = target.radius + 12;
  const time = world.ambientTime;
  ctx.save();
  ctx.translate(target.x, target.y);
  ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.85);
  ctx.lineWidth = 1.6 / world.zoom;
  ctx.setLineDash([8, 8]);
  ctx.lineDashOffset = -time * 18;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  const bracket = 7;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const x = Math.cos(angle) * (radius + 5);
    const y = Math.sin(angle) * (radius + 5);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.95);
    ctx.lineWidth = 2 / world.zoom;
    ctx.beginPath();
    ctx.moveTo(-bracket, 0);
    ctx.lineTo(bracket, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export function drawOverlayEffects(world: GameWorld, shakeX: number, shakeY: number) {
  const ctx = world.ctx;
  const { width, height } = world;

  // Slow drifting dust
  ctx.save();
  for (const mote of world.motes) {
    const x = (mote.x * width + world.ambientTime * mote.drift) % (width + 30) - 15;
    const y = mote.y * height + Math.sin(world.ambientTime * 0.6 + mote.phase) * 10;
    ctx.globalAlpha = 0.1 + Math.sin(world.ambientTime + mote.phase) * 0.05;
    ctx.fillStyle = mote.color;
    ctx.beginPath();
    ctx.arc(x, y, mote.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // The dark edge vignette lives in CSS (`.vignette-overlay`): it is a static
  // screen-space layer, so the compositor paints it once instead of the game
  // evaluating a full-screen gradient every frame.

  // Chromatic-ish edge glow while hurt
  if (world.hurtFlash > 0) {
    ctx.fillStyle = `rgba(255, 41, 91, ${world.hurtFlash * 0.16})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (world.healFlash > 0) {
    ctx.fillStyle = `rgba(88, 255, 151, ${world.healFlash * 0.09})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (world.player.hp > 0 && world.player.hp < 34 && world.dangerGlow) {
    const danger =
      (1 - world.player.hp / 34) * (0.14 + Math.sin(world.ambientTime * 5) * 0.05);
    // The gradient is fixed per size; only its opacity pulses.
    ctx.save();
    ctx.globalAlpha = Math.max(0, danger);
    ctx.fillStyle = world.dangerGlow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  if (world.killFlash > 0) {
    ctx.fillStyle = `rgba(190, 255, 255, ${world.killFlash * 0.045})`;
    ctx.fillRect(0, 0, width, height);
  }

  // Dodge: a brief cyan bloom at the ship, so a dash still lights up the
  // frame without the wind streaks.
  if (world.dashFlash > 0) {
    const k = world.dashFlash / 0.22;
    const bloom = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.62,
    );
    bloom.addColorStop(0, `rgba(200, 255, 255, ${0.16 * k})`);
    bloom.addColorStop(0.4, `rgba(95, 246, 255, ${0.07 * k})`);
    bloom.addColorStop(1, 'rgba(95, 246, 255, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Impact frame
  if (world.shake > 7) {
    ctx.save();
    ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
    ctx.strokeStyle = `rgba(255, 77, 125, ${Math.min(0.4, world.shake / 45)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, width - 12, height - 12);
    ctx.restore();
  }
}
