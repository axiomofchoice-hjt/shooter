/** Escort funnel visuals: link tether, hover body and muzzle flash. */

import { TAU, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';
import { WEAPONS } from '../weapons';

export function drawFunnels(world: GameWorld) {
  const weapon = WEAPONS[world.player.weapon];
  if (
    (!weapon.funnel && !weapon.coopFunnel) ||
    world.player.dead ||
    world.funnels.length === 0
  ) {
    return;
  }
  const ctx = world.ctx;
  const player = world.player;
  const color = weapon.color;
  const time = world.ambientTime;

  for (const funnel of world.funnels) {
    const bob = Math.sin(time * 3.2 + funnel.seed) * 2.4;
    const x = funnel.x;
    const y = funnel.y + bob;

    // Faint energy link, fading out with distance so it never becomes a
    // bright line across the whole room.
    const dx = x - player.x;
    const dy = y - player.y;
    const link = Math.hypot(dx, dy);
    if (link < 380) {
      const fade = 1 - link / 380;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha(color, 0.05 + fade * 0.08);
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 9]);
      ctx.lineDashOffset = -time * 24;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(funnel.angle);

    // Engine bloom behind the hull.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(-7, 0, 0, -7, 0, 13);
    glow.addColorStop(0, withAlpha(color, 0.55));
    glow.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(-7, 0, 13, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Swept fins.
    ctx.fillStyle = withAlpha(color, 0.22);
    ctx.strokeStyle = withAlpha(color, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, -2);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-3, -1);
    ctx.closePath();
    ctx.moveTo(1, 2);
    ctx.lineTo(-8, 9);
    ctx.lineTo(-3, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hull.
    ctx.fillStyle = 'rgba(10, 14, 22, 0.96)';
    ctx.strokeStyle = withAlpha(color, 0.95);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(2, 5);
    ctx.lineTo(-6, 3.5);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-6, -3.5);
    ctx.lineTo(2, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Core and barrel.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();

    if (funnel.muzzle > 0) {
      const flash = funnel.muzzle / 0.08;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha('#ffffff', 0.9 * flash);
      ctx.beginPath();
      ctx.arc(12, 0, 4.5 * flash, 0, TAU);
      ctx.fill();
      ctx.fillStyle = withAlpha(color, 0.5 * flash);
      ctx.beginPath();
      ctx.arc(12, 0, 9 * flash, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/** The single attackable partner drone, drawn from its turret hitbox. */
export function drawPartner(world: GameWorld) {
  const weapon = WEAPONS[world.player.weapon];
  if (!weapon.partner || world.player.dead) return;
  const partner = world.turrets.find((turret) => turret.partner);
  if (!partner) return;
  const ctx = world.ctx;
  const player = world.player;
  const color = partner.color;
  const time = world.ambientTime;
  const bob = Math.sin(time * 3.2 + partner.seed) * 2.4;
  const x = partner.x;
  const y = partner.y + bob;

  const dx = x - player.x;
  const dy = y - player.y;
  const link = Math.hypot(dx, dy);
  if (link < 380) {
    const fade = 1 - link / 380;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(color, 0.05 + fade * 0.08);
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 9]);
    ctx.lineDashOffset = -time * 24;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(partner.angle);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(-7, 0, 0, -7, 0, 15);
  glow.addColorStop(0, withAlpha(color, 0.55));
  glow.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(-7, 0, 15, 0, TAU);
  ctx.fill();
  ctx.restore();

  const hull = partner.hitFlash > 0 ? '#ffffff' : 'rgba(10, 14, 22, 0.96)';
  const stroke = partner.hitFlash > 0 ? '#ffffff' : withAlpha(color, 0.95);
  ctx.fillStyle = withAlpha(color, 0.22);
  ctx.strokeStyle = withAlpha(color, 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1, -2);
  ctx.lineTo(-8, -9);
  ctx.lineTo(-3, -1);
  ctx.closePath();
  ctx.moveTo(1, 2);
  ctx.lineTo(-8, 9);
  ctx.lineTo(-3, 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = hull;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(2, 5);
  ctx.lineTo(-6, 3.5);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-6, -3.5);
  ctx.lineTo(2, -5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 2.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = withAlpha(color, 0.9);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(12, 0);
  ctx.stroke();

  if (partner.muzzle > 0) {
    const flash = partner.muzzle / 0.08;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = withAlpha('#ffffff', 0.9 * flash);
    ctx.beginPath();
    ctx.arc(12, 0, 4.5 * flash, 0, TAU);
    ctx.fill();
    ctx.fillStyle = withAlpha(color, 0.5 * flash);
    ctx.beginPath();
    ctx.arc(12, 0, 9 * flash, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // HP bar: the partner is the only escort that can be attacked, so always
  // show its remaining hull instead of waiting for the first hit.
  const width = 30;
  const fill = Math.max(0, partner.hp / partner.maxHp);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x - width / 2, y - 24, width, 4);
  ctx.fillStyle = withAlpha(color, 0.95);
  ctx.fillRect(x - width / 2, y - 24, width * fill, 4);
  ctx.restore();
}
