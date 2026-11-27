/** The player ship, its dodge wake and afterimages. */

import { armorOf } from '../armors';
import { DASH_TIME, PLAYER_COLOR } from '../core/config';
import type { DashGhost, Player } from '../core/entities';
import { TAU, clamp, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';

export function drawDashGhosts(world: GameWorld) {
  const ctx = world.ctx;

  // Launch ring: expands once from the point where the dodge started, which
  // stays put even while the ship slides away from it.
  if (world.dashRing.life > 0) drawDashRing(world);

  // Comet ribbon from the launch point to the live ship: the clearest
  // "this is a dodge, not a walk" cue while the slide is happening.
  const player = world.player;
  if (player.dashTime > 0 && world.dashRing.life > 0) {
    drawDashRibbon(world, player);
  }

  if (world.dashTrail.life > 0) drawDashTrail(world);

  if (!world.ghosts.length) return;
  ctx.save();
  for (const ghost of world.ghosts) drawGhostShip(world, ghost);
  ctx.restore();
}

function drawDashRing(world: GameWorld) {
  const ctx = world.ctx;
  const t = 1 - world.dashRing.life / world.dashRing.maxLife;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(PLAYER_COLOR, (1 - t) * 0.5);
  ctx.lineWidth = 3 * (1 - t) + 0.4;
  ctx.beginPath();
  ctx.arc(world.dashRing.x, world.dashRing.y, 18 + t * 40, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawDashRibbon(world: GameWorld, player: Player) {
  const ctx = world.ctx;
  const dx = player.x - world.dashRing.x;
  const dy = player.y - world.dashRing.y;
  const span = Math.hypot(dx, dy);
  if (span <= 4) return;

  const nx = -dy / span;
  const ny = dx / span;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const ribbon = ctx.createLinearGradient(
    world.dashRing.x,
    world.dashRing.y,
    player.x,
    player.y,
  );
  ribbon.addColorStop(0, 'rgba(95, 246, 255, 0)');
  ribbon.addColorStop(0.55, 'rgba(120, 250, 255, 0.16)');
  ribbon.addColorStop(1, 'rgba(210, 255, 255, 0.34)');
  ctx.fillStyle = ribbon;
  ctx.beginPath();
  ctx.moveTo(world.dashRing.x + nx * 5, world.dashRing.y + ny * 5);
  ctx.lineTo(player.x + nx * 15, player.y + ny * 15);
  ctx.lineTo(player.x - nx * 15, player.y - ny * 15);
  ctx.lineTo(world.dashRing.x - nx * 5, world.dashRing.y - ny * 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDashTrail(world: GameWorld) {
  const ctx = world.ctx;
  const trail = world.dashTrail;
  const t = trail.life / trail.maxLife;
  const dx = trail.x2 - trail.x1;
  const dy = trail.y2 - trail.y1;
  const span = Math.hypot(dx, dy) || 1;
  const nx = -dy / span;
  const ny = dx / span;
  // Tapered, gradient tail: thin and transparent where the dodge began,
  // widest and brightest where the ship came to rest.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const tail = ctx.createLinearGradient(trail.x1, trail.y1, trail.x2, trail.y2);
  tail.addColorStop(0, 'rgba(95, 246, 255, 0)');
  tail.addColorStop(0.5, `rgba(95, 246, 255, ${0.16 * t})`);
  tail.addColorStop(1, `rgba(140, 250, 255, ${0.4 * t})`);
  const w0 = 1.5;
  const w1 = 5 + 11 * t;
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.moveTo(trail.x1 + nx * w0, trail.y1 + ny * w0);
  ctx.lineTo(trail.x2 + nx * w1, trail.y2 + ny * w1);
  ctx.lineTo(trail.x2 - nx * w1, trail.y2 - ny * w1);
  ctx.lineTo(trail.x1 - nx * w0, trail.y1 - ny * w0);
  ctx.closePath();
  ctx.fill();

  const core = ctx.createLinearGradient(trail.x1, trail.y1, trail.x2, trail.y2);
  core.addColorStop(0, 'rgba(230, 255, 255, 0)');
  core.addColorStop(1, `rgba(240, 255, 255, ${0.5 * t})`);
  ctx.strokeStyle = core;
  ctx.lineWidth = 1 + 1.6 * t;
  ctx.beginPath();
  ctx.moveTo(trail.x1, trail.y1);
  ctx.lineTo(trail.x2, trail.y2);
  ctx.stroke();
  ctx.restore();
}

/** Solid, darkened copy of the ship; the silhouette is what makes it read as
 * the player instead of a string of glowing bubbles. */
function drawGhostShip(world: GameWorld, ghost: DashGhost) {
  const ctx = world.ctx;
  const t = clamp(ghost.life / ghost.maxLife, 0, 1);
  ctx.save();
  ctx.translate(ghost.x, ghost.y);
  ctx.rotate(ghost.angle);

  ctx.globalAlpha = 0.25 + t * 0.7;
  ctx.fillStyle = 'rgba(14, 44, 58, 0.92)';
  ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.7);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(10, 32, 44, 0.92)';
  ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.5);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(2, -5, 26, 10, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = withAlpha(PLAYER_COLOR, 0.16);
  ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.55);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-6, -10);
  ctx.lineTo(-20, -16);
  ctx.lineTo(-14, -3);
  ctx.closePath();
  ctx.moveTo(-6, 10);
  ctx.lineTo(-20, 16);
  ctx.lineTo(-14, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = withAlpha('#d9fdff', 0.55 + t * 0.4);
  ctx.beginPath();
  ctx.arc(0, 0, 4.6, 0, TAU);
  ctx.fill();

  ctx.restore();
}

export function drawPlayer(world: GameWorld) {
  const ctx = world.ctx;
  const player = world.player;
  if (player.dead) return;
  const blink = player.invuln > 0 && Math.floor(world.elapsed * 18) % 2 === 0;
  const pulse = 1 + Math.sin(world.ambientTime * 3) * 0.04;

  ctx.save();
  ctx.translate(player.x, player.y);

  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 14, 22, 9, 0, 0, TAU);
  ctx.fill();

  // Aura
  const aura = ctx.createRadialGradient(0, 0, 6, 0, 0, 46);
  aura.addColorStop(0, 'rgba(95, 246, 255, 0.17)');
  aura.addColorStop(1, 'rgba(95, 246, 255, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, TAU);
  ctx.fill();

  if (player.dashTime > 0) drawDashWake(world, player);

  if (player.invuln > 0) {
    ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.45);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 27 + Math.sin(world.elapsed * 10) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawShieldBubble(world, player);

  ctx.rotate(player.angle);
  ctx.globalAlpha = blink ? 0.55 : 1;
  drawPlayerHull(world, player, pulse);

  ctx.restore();
}

/**
 * Armor shield: a faint bubble around the hull while it has charge, and a
 * bright expanding ring each time it eats a hit.
 */
function drawShieldBubble(world: GameWorld, player: Player) {
  if (player.shieldMax <= 0) return;
  const ctx = world.ctx;
  const armor = armorOf(player.armor);
  const ratio = clamp(player.shield / player.shieldMax, 0, 1);
  const flash = clamp(player.shieldFlash, 0, 1);
  if (ratio > 0 || flash > 0) {
    const breathe = 1 + Math.sin(world.ambientTime * 2.6) * 0.03;
    const radius = 25 * breathe + flash * 4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, radius * 0.55, 0, 0, radius);
    glow.addColorStop(0, withAlpha(armor.color, 0));
    glow.addColorStop(0.82, withAlpha(armor.color, 0.05 + flash * 0.12));
    glow.addColorStop(1, withAlpha(armor.color, 0.16 * ratio + flash * 0.2));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(armor.color, 0.14 * ratio + flash * 0.5);
    ctx.lineWidth = 1 + flash * 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  if (flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(armor.color, flash * 0.7);
    ctx.lineWidth = 2.4 * flash + 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, 25 + (1 - flash) * 26, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Dodge wake: layered afterburner cones plus flickering jets, so an ordinary
 * stick move never looks like this.
 */
function drawDashWake(world: GameWorld, player: Player) {
  const ctx = world.ctx;
  const charge = clamp(player.dashTime / DASH_TIME, 0, 1);
  const flicker = 0.82 + Math.sin(world.elapsed * 46) * 0.18;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.rotate(Math.atan2(player.dashDirY, player.dashDirX));

  const len = 54 + 74 * charge;
  const wake = ctx.createLinearGradient(0, 0, -len, 0);
  wake.addColorStop(0, 'rgba(200, 255, 255, 0.42)');
  wake.addColorStop(0.35, 'rgba(95, 246, 255, 0.2)');
  wake.addColorStop(1, 'rgba(95, 246, 255, 0)');
  ctx.fillStyle = wake;
  ctx.beginPath();
  ctx.moveTo(-8, -18);
  ctx.quadraticCurveTo(-len * 0.62, 0, -8, 18);
  ctx.closePath();
  ctx.fill();

  // Two hot jets out of the rear fins.
  for (const side of [-1, 1]) {
    const jet = 30 + 26 * charge * flicker;
    const flame = ctx.createLinearGradient(-10, 0, -10 - jet, 0);
    flame.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    flame.addColorStop(0.35, 'rgba(150, 252, 255, 0.5)');
    flame.addColorStop(1, 'rgba(95, 246, 255, 0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-12, side * 4);
    ctx.lineTo(-12 - jet, side * 11);
    ctx.lineTo(-12, side * 13);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(225, 255, 255, 0.55)';
  ctx.lineWidth = 1.5;
  for (const offset of [-11, 0, 11]) {
    ctx.beginPath();
    ctx.moveTo(-14, offset);
    ctx.lineTo(-len * (offset === 0 ? 0.95 : 0.66), offset * 1.3);
    ctx.stroke();
  }
  ctx.restore();

  const burst = ctx.createRadialGradient(0, 0, 2, 0, 0, 36);
  burst.addColorStop(0, 'rgba(240, 255, 255, 0.6)');
  burst.addColorStop(1, 'rgba(95, 246, 255, 0)');
  ctx.fillStyle = burst;
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, TAU);
  ctx.fill();
}

/** Barrel, fins, hull and inner core, drawn in the ship's heading frame. */
function drawPlayerHull(world: GameWorld, player: Player, pulse: number) {
  const ctx = world.ctx;

  // Barrel
  ctx.fillStyle = 'rgba(10, 35, 46, 0.95)';
  ctx.strokeStyle = PLAYER_COLOR;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(2, -5, 26, 10, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = withAlpha(PLAYER_COLOR, 0.55);
  ctx.fillRect(12, -2, 12, 4);

  // Rear fins
  ctx.fillStyle = withAlpha(PLAYER_COLOR, 0.18);
  ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.8);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6, -10);
  ctx.lineTo(-20, -16);
  ctx.lineTo(-14, -3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, 10);
  ctx.lineTo(-20, 16);
  ctx.lineTo(-14, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hull (white-hot while dodging)
  const dashing = player.dashTime > 0;
  ctx.fillStyle = '#071722';
  ctx.strokeStyle = dashing ? '#f2ffff' : PLAYER_COLOR;
  ctx.lineWidth = dashing ? 3 : 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 17 * pulse, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Inner details
  ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.4);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 11.5, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = '#d9fdff';
  ctx.beginPath();
  ctx.arc(0, 0, 5.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = PLAYER_COLOR;
  ctx.beginPath();
  ctx.arc(0, 0, 2.4, 0, TAU);
  ctx.fill();

  drawMuzzleFlash(ctx, player);
}

function drawMuzzleFlash(ctx: CanvasRenderingContext2D, player: Player) {
  if (player.muzzle <= 0) return;
  const flash = Math.min(1, player.muzzle / 0.06);
  ctx.fillStyle = withAlpha('#ffffff', 0.82 * flash);
  ctx.beginPath();
  ctx.moveTo(29, 0);
  ctx.lineTo(40 + 8 * flash, -9);
  ctx.lineTo(38, 0);
  ctx.lineTo(40 + 8 * flash, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withAlpha(player.muzzleColor, 0.5 * flash);
  ctx.beginPath();
  ctx.arc(30, 0, 12 * flash, 0, TAU);
  ctx.fill();
}
