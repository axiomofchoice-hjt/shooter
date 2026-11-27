/** Portal, pickups, range rings, bomber shadows and fire rings. */

import { DUNGEON_ROOMS, PORTAL_RADIUS, PORTAL_X, PORTAL_Y } from '../core/config';
import { ENEMY_DEFS } from '../core/enemyDefs';
import { TAU, clamp, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';
import { countCleared } from '../systems/world';
import { WEAPONS } from '../weapons';

/**
 * Faint ring for the equipped weapon's maximum range. Range-limited weapons
 * (seeker, flamer, bubble) draw it; the rest draw nothing.
 */
export function drawWeaponRange(world: GameWorld) {
  const spec = WEAPONS[world.player.weapon];
  if (world.player.dead) return;
  const ctx = world.ctx;
  const player = world.player;
  const breathe = 0.5 + Math.sin(world.ambientTime * 2.2) * 0.5;

  // The impact cannon has a range for auto-aim only; its rectangle is not
  // telegraphed on the floor.
  if (spec.ram || !spec.range) return;
  ctx.save();
  ctx.fillStyle = withAlpha(spec.color, 0.025);
  ctx.strokeStyle = withAlpha(spec.color, 0.2 + breathe * 0.08);
  ctx.lineWidth = 2 / world.zoom;
  ctx.setLineDash([12, 14]);
  ctx.lineDashOffset = -world.ambientTime * 16;
  ctx.beginPath();
  ctx.arc(player.x, player.y, spec.range, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Ground layer of the carpet bomber: the call-in corridor and the plane's
 * shadow. The plane itself is drawn above everyone in drawBombers.
 */
export function drawBomberShadows(world: GameWorld) {
  if (!world.bombers.length) return;
  const ctx = world.ctx;
  for (const bomber of world.bombers) {
    const travelled = Math.max(
      0,
      (bomber.elapsed - bomber.callIn) * bomber.speed,
    );
    const x = bomber.startX + bomber.dirX * travelled;
    const y = bomber.startY + bomber.dirY * travelled;

    if (bomber.elapsed < bomber.callIn) {
      // Dashed corridor before the plane arrives, so the run is telegraphed.
      const angle = Math.atan2(bomber.dirY, bomber.dirX);
      ctx.save();
      ctx.strokeStyle = withAlpha(bomber.color, 0.32);
      ctx.lineWidth = 2 / world.zoom;
      ctx.setLineDash([18, 12]);
      ctx.lineDashOffset = -world.ambientTime * 44;
      ctx.beginPath();
      ctx.moveTo(bomber.startX, bomber.startY);
      ctx.lineTo(bomber.endX, bomber.endY);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let d = 150; d < bomber.length; d += 190) {
        const px = bomber.startX + bomber.dirX * d;
        const py = bomber.startY + bomber.dirY * d;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(angle);
        ctx.strokeStyle = withAlpha(bomber.color, 0.5);
        ctx.lineWidth = 2 / world.zoom;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(2, 0);
        ctx.lineTo(-6, 6);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    } else if (travelled <= bomber.length) {
      ctx.save();
      ctx.translate(x + 10, y + 16);
      ctx.rotate(Math.atan2(bomber.dirY, bomber.dirX));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 23, 8, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Burning rings left by airstrike bombs: floor layer, under the enemies. */
/**
 * Mine layer: each mine is a small buried disc with a line back to the impact
 * that planted it. Until the arm time passes the mine is dim and its line is
 * faint, so the player can see when it becomes live; armed mines pulse and
 * show their trigger circle. The line is a hint only and never collides.
 */
export function drawMines(world: GameWorld) {
  if (!world.mines.length) return;
  const ctx = world.ctx;
  const time = world.ambientTime;
  ctx.save();
  ctx.lineCap = 'round';
  for (const mine of world.mines) {
    const armed = mine.age >= mine.armTime;
    const fade = clamp(mine.life - mine.age, 0, 0.4) / 0.4;
    const armT = clamp(mine.age / Math.max(0.001, mine.armTime), 0, 1);
    const pulse = armed ? 0.5 + Math.sin(time * 6 + mine.seed) * 0.5 : 0;

    // The hint line from the impact point to the mine.
    ctx.strokeStyle = withAlpha(
      mine.color,
      (armed ? 0.2 + pulse * 0.12 : 0.1 * armT) * fade,
    );
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.lineDashOffset = -time * (armed ? 8 : 2);
    ctx.beginPath();
    ctx.moveTo(mine.originX, mine.originY);
    ctx.lineTo(mine.x, mine.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Trigger circle while armed, so the danger zone is readable.
    if (armed) {
      ctx.strokeStyle = withAlpha(mine.color, 0.16 + pulse * 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, mine.triggerRadius, 0, TAU);
      ctx.stroke();
    }

    // The mine body rises out of the floor as it arms.
    const rise = armed ? 1 : armT;
    ctx.save();
    ctx.translate(mine.x, mine.y);
    ctx.fillStyle = `rgba(8, 20, 14, ${0.75 * fade})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, mine.radius * 1.15, mine.radius * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = withAlpha(mine.color, (armed ? 0.55 + pulse * 0.3 : 0.4) * fade);
    ctx.beginPath();
    ctx.arc(0, -2 * rise, mine.radius * (0.55 + rise * 0.45), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha('#ffffff', (armed ? 0.7 : 0.35) * fade);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, -2 * rise, mine.radius * 1.1, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export function drawFireRings(world: GameWorld) {
  if (!world.fireRings.length) return;
  const ctx = world.ctx;
  ctx.save();
  // Scorch base in normal blending, then the fire itself additively.
  for (const ring of world.fireRings) {
    const fade = Math.min(1, ring.life / 0.55);
    ctx.fillStyle = `rgba(26, 10, 4, ${0.17 * fade})`;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius * 0.92, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const ring of world.fireRings) {
    const fade = Math.min(1, ring.life / 0.55);
    const pulse = ring.pulse;
    const flicker =
      1 + Math.sin(world.ambientTime * 7 + ring.seed) * 0.035 + pulse * 0.05;
    const radius = ring.radius * flicker;
    const gradient = ctx.createRadialGradient(
      ring.x,
      ring.y,
      radius * 0.2,
      ring.x,
      ring.y,
      radius,
    );
    gradient.addColorStop(0, 'rgba(255, 120, 30, 0)');
    gradient.addColorStop(0.55, 'rgba(255, 90, 20, 0)');
    gradient.addColorStop(
      0.8,
      withAlpha('#ff5a1f', (0.1 + pulse * 0.06) * fade),
    );
    gradient.addColorStop(
      0.93,
      withAlpha('#ffb347', (0.3 + pulse * 0.08) * fade),
    );
    gradient.addColorStop(1, 'rgba(255, 180, 70, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, TAU);
    ctx.fill();

    // Uneven burning rim instead of a perfect circle.
    const steps = 28;
    ctx.strokeStyle = withAlpha('#ffcf6b', (0.55 + pulse * 0.25) * fade);
    ctx.lineWidth = 2 + pulse * 1.4;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * TAU;
      const wobble =
        1 +
        Math.sin(angle * 5 + world.ambientTime * 9 + ring.seed) * 0.035 +
        Math.sin(angle * 9 - world.ambientTime * 6) * 0.018;
      const r = radius * 0.94 * wobble;
      const px = ring.x + Math.cos(angle) * r;
      const py = ring.y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPortal(world: GameWorld) {
  if (world.mode !== 'dungeon') return;
  const ctx = world.ctx;
  const active = countCleared(world) >= DUNGEON_ROOMS - 2;
  const t = world.ambientTime;
  const color = active ? '#c08bff' : '#6b6485';

  ctx.save();
  ctx.translate(PORTAL_X, PORTAL_Y);

  ctx.fillStyle = active ? 'rgba(90, 50, 150, 0.16)' : 'rgba(40, 36, 60, 0.2)';
  ctx.beginPath();
  ctx.arc(0, 0, PORTAL_RADIUS + 26, 0, TAU);
  ctx.fill();

  for (let i = 0; i < 4; i++) {
    const r = 34 + i * 22;
    const spin = t * (active ? 0.8 : 0.16) * (i % 2 === 0 ? 1 : -1) + i;
    ctx.strokeStyle = withAlpha(color, active ? 0.5 - i * 0.09 : 0.18);
    ctx.lineWidth = (i === 0 ? 3 : 1.6) / world.zoom;
    ctx.setLineDash(i === 2 ? [10, 14] : []);
    ctx.beginPath();
    ctx.arc(0, 0, r + Math.sin(t * 1.6 + i) * 2.5, spin, spin + TAU * (0.55 + i * 0.08));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (active) {
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(0, -280, 0, 10);
    beam.addColorStop(0, 'rgba(192, 139, 255, 0)');
    beam.addColorStop(0.65, 'rgba(192, 139, 255, 0.1)');
    beam.addColorStop(1, 'rgba(192, 139, 255, 0.3)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-12, -280);
    ctx.lineTo(12, -280);
    ctx.lineTo(PORTAL_RADIUS, 0);
    ctx.lineTo(-PORTAL_RADIUS, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    const glow = 6 + Math.sin(t * 4) * 1.8;
    ctx.fillStyle = 'rgba(236, 224, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, glow, 0, TAU);
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(160, 150, 190, 0.55)';
    ctx.lineWidth = 2 / world.zoom;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(9, 0);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTelegraphs(world: GameWorld) {
  const ctx = world.ctx;
  for (const telegraph of world.telegraphs) {
    const color = ENEMY_DEFS[telegraph.kind].color;
    const progress = 1 - telegraph.timer / telegraph.duration;
    const pulse = 0.65 + Math.sin(world.ambientTime * 22) * 0.25;
    ctx.save();
    ctx.translate(telegraph.x, telegraph.y);
    ctx.globalAlpha = 0.45 + progress * 0.5;
    ctx.strokeStyle = withAlpha(color, 0.9);
    ctx.lineWidth = 2 / world.zoom;
    ctx.beginPath();
    ctx.arc(0, 0, 34 - progress * 15, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.beginPath();
    ctx.arc(0, 0, 42, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
    ctx.stroke();
    ctx.globalAlpha = 0.1 * pulse;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = withAlpha(color, 0.8);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i * TAU) / 4 + world.ambientTime * 1.5;
      ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
      ctx.lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export function drawPickups(world: GameWorld) {
  const ctx = world.ctx;
  for (const pickup of world.pickups) {
    const bob = Math.sin(pickup.age * 3.2) * 4;
    const pulse = 0.7 + Math.sin(pickup.age * 5) * 0.2;
    ctx.save();
    ctx.translate(pickup.x, pickup.y + bob);
    ctx.globalAlpha = pickup.life < 4 ? 0.45 + Math.sin(pickup.age * 12) * 0.35 : 1;
    ctx.strokeStyle = 'rgba(125, 255, 155, 0.35)';
    ctx.lineWidth = 2 / world.zoom;
    ctx.beginPath();
    ctx.arc(0, 0, 24 * pulse, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(8, 24, 18, 0.95)';
    ctx.strokeStyle = '#7dff9b';
    ctx.lineWidth = 2.5 / world.zoom;
    ctx.beginPath();
    ctx.roundRect(-12, -12, 24, 24, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7dff9b';
    ctx.fillRect(-2.5, -8, 5, 16);
    ctx.fillRect(-8, -2.5, 16, 5);
    ctx.restore();
  }
}
