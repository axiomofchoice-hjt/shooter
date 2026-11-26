/** Sentry turret and orbit-guard visuals. */

import { TAU, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';
import { TURRET, WEAPONS } from '../weapons';

/** Sentry turrets: range hint, body and remaining HP. */
export function drawTurrets(world: GameWorld) {
  if (world.turrets.length === 0) return;
  const ctx = world.ctx;
  for (const turret of world.turrets) {
    if (turret.partner) continue;
    const color = turret.color;
    const pulse = 0.5 + Math.sin(world.ambientTime * 3 + turret.seed) * 0.5;
    ctx.save();
    ctx.translate(turret.x, turret.y);

    // Range hint, so the reach is readable at a glance.
    ctx.strokeStyle = withAlpha(color, 0.1 + pulse * 0.04);
    ctx.fillStyle = withAlpha(color, 0.015);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -world.ambientTime * 12;
    ctx.beginPath();
    ctx.arc(0, 0, TURRET.range, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // Base.
    ctx.fillStyle = turret.hitFlash > 0 ? '#ffffff' : 'rgba(12, 16, 20, 0.95)';
    ctx.strokeStyle = withAlpha(color, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, TURRET.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = withAlpha(color, 0.35);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, TURRET.radius - 4, 0, TAU);
    ctx.stroke();

    // Barrel and muzzle flash.
    ctx.save();
    ctx.rotate(turret.angle);
    ctx.fillStyle = withAlpha(color, 0.85);
    ctx.fillRect(TURRET.radius - 2, -2.5, 14, 5);
    if (turret.muzzle > 0) {
      const flash = turret.muzzle / 0.08;
      ctx.fillStyle = withAlpha('#ffffff', 0.85 * flash);
      ctx.beginPath();
      ctx.arc(TURRET.radius + 12, 0, 6 * flash, 0, TAU);
      ctx.fill();
      ctx.fillStyle = withAlpha(color, 0.5 * flash);
      ctx.beginPath();
      ctx.arc(TURRET.radius + 12, 0, 11 * flash, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // HP bar only once it has been hurt.
    if (turret.hp < turret.maxHp) {
      const width = 26;
      const fill = Math.max(0, turret.hp / turret.maxHp);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(-width / 2, -TURRET.radius - 15, width, 4);
      ctx.fillStyle = withAlpha(color, 0.9);
      ctx.fillRect(-width / 2, -TURRET.radius - 15, width * fill, 4);
    }
    ctx.restore();
  }
}

/** Three glowing guards; their orbit ring doubles as the weapon's reach. */
export function drawOrbs(world: GameWorld) {
  const weapon = WEAPONS[world.player.weapon];
  const spec = weapon.orbit;
  if (!spec || world.player.dead) return;
  const ctx = world.ctx;
  const player = world.player;
  const radius = world.orbitRadius > 0 ? world.orbitRadius : spec.idleRadius;
  const ball = spec.ballRadius;
  const active = world.orbitExpand;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  ctx.strokeStyle = withAlpha(weapon.color, 0.1 + active * 0.07);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(player.x, player.y, radius, 0, TAU);
  ctx.stroke();

  for (let i = 0; i < spec.count; i++) {
    const angle = world.orbitAngle + (i * TAU) / spec.count;
    const x = player.x + Math.cos(angle) * radius;
    const y = player.y + Math.sin(angle) * radius;

    // Comet tail along the orbit, longer and brighter when spun up.
    const tail = 0.34 + active * 0.3;
    ctx.strokeStyle = withAlpha(weapon.color, 0.22 + active * 0.1);
    ctx.lineWidth = ball * 1.1;
    ctx.beginPath();
    ctx.arc(player.x, player.y, radius, angle - tail, angle);
    ctx.stroke();

    const glow = ctx.createRadialGradient(x, y, 1, x, y, ball * 2.4);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    glow.addColorStop(0.4, withAlpha(weapon.color, 0.55));
    glow.addColorStop(1, withAlpha(weapon.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, ball * 2.4, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, ball * 0.42, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = withAlpha(weapon.color, 0.85);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, ball, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
