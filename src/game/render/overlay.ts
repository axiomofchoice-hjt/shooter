/** Banner and menu atmosphere overlays. */

import { withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';

export function drawBanner(world: GameWorld) {
  const banner = world.banner;
  if (!banner) return;
  const ctx = world.ctx;
  const t = banner.time;
  const progress = 1 - t / banner.duration;
  const alpha = Math.min(1, progress * 6, t * 2.2);
  const y =
    world.height *
    (world.mode === 'boss'
      ? world.width < 620
        ? 0.38
        : 0.3
      : world.width < 620
        ? 0.3
        : 0.25);
  const titleSize = world.width < 620 ? 30 : 44;
  const subSize = world.width < 620 ? 11 : 13;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.strokeStyle = withAlpha(banner.color, 0.45);
  ctx.lineWidth = 1;
  const lineW = Math.min(world.width * 0.34, 240);
  ctx.beginPath();
  ctx.moveTo(world.width / 2 - lineW, y);
  ctx.lineTo(world.width / 2 - 24, y);
  ctx.moveTo(world.width / 2 + 24, y);
  ctx.lineTo(world.width / 2 + lineW, y);
  ctx.stroke();

  ctx.fillStyle = withAlpha(banner.color, 0.16);
  ctx.fillRect(world.width / 2 - 3, y - 3, 6, 6);

  ctx.font =
    `800 ${titleSize}px "Arial Narrow", "DIN Condensed", ` +
    'ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#eaffff';
  ctx.shadowColor = banner.color;
  ctx.shadowBlur = 24;
  ctx.fillText(banner.title, world.width / 2, y - 1);
  ctx.shadowBlur = 0;

  ctx.font = `500 ${subSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillStyle = withAlpha(banner.color, 0.9);
  ctx.fillText(banner.sub, world.width / 2, y + titleSize * 0.72);
  ctx.restore();
}

export function drawMenuAtmosphere(world: GameWorld) {
  const ctx = world.ctx;
  const { width, height } = world;
  ctx.save();
  ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
  // Slow scan beam
  const beam = (world.ambientTime * 22) % (height + 260) - 130;
  const grad = ctx.createLinearGradient(0, beam - 80, 0, beam + 80);
  grad.addColorStop(0, 'rgba(95, 246, 255, 0)');
  grad.addColorStop(0.5, 'rgba(95, 246, 255, 0.045)');
  grad.addColorStop(1, 'rgba(95, 246, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, beam - 80, width, 160);
  ctx.restore();
}
