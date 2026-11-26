/** Enemy bodies, attack telegraphs and health bars. */

import { BOSS_COLOR, ENEMY_GLOW } from '../core/config';
import type { EnemyAttackDef } from '../core/enemyDefs';
import { ENEMY_BEHAVIOR } from '../core/enemyDefs';
import type { Enemy } from '../core/entities';
import { TAU, clamp, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';
import { enemyAttackPoint } from '../systems/turrets';

export function drawEnemies(world: GameWorld) {
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    drawEnemy(world, enemy);
    if (enemy.kind !== 'boss') drawEnemyAttack(world, enemy);
    drawEnemyStatus(world, enemy);
  }
}

/** Spawn-in shadow, glow shell and hull for one enemy. */
function drawEnemy(world: GameWorld, enemy: Enemy) {
  const ctx = world.ctx;
  const spawnT = Math.min(1, enemy.age / 0.22);
  const scale = 0.55 + spawnT * 0.45;
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.globalAlpha = spawnT;

  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, enemy.radius * 0.65, enemy.radius * 0.9, enemy.radius * 0.4, 0, 0, TAU);
  ctx.fill();

  ctx.scale(scale, scale);
  ctx.rotate(enemy.angle);

  // Soft neon glow shell
  ctx.fillStyle = withAlpha(enemy.color, ENEMY_GLOW);
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius + 10, 0, TAU);
  ctx.fill();

  const coreFill = enemy.hitFlash > 0 ? '#ffffff' : withAlpha(enemy.color, 0.16);
  ctx.fillStyle = coreFill;
  ctx.strokeStyle = enemy.hitFlash > 0 ? '#ffffff' : enemy.color;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';

  switch (enemy.kind) {
    case 'grunt':
      drawGruntHull(ctx, enemy);
      break;
    case 'runner':
      drawRunnerHull(ctx, enemy);
      break;
    case 'tank':
      drawTankHull(ctx, enemy, world.elapsed);
      break;
    case 'spitter':
      drawSpitterHull(ctx, enemy);
      break;
    case 'splitter':
      drawSplitterHull(ctx, enemy, world.elapsed);
      break;
    case 'homing':
      drawHomingHull(ctx, enemy, world.elapsed);
      break;
    case 'boss':
      drawBossHull(ctx, enemy, world.elapsed);
      break;
  }

  ctx.restore();
}

function drawGruntHull(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (i * TAU) / 4 + Math.PI / 4;
    const px = Math.cos(angle) * enemy.radius;
    const py = Math.sin(angle) * enemy.radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : withAlpha(enemy.color, 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = withAlpha(enemy.color, 0.5);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -enemy.radius - 5);
  ctx.lineTo(0, -enemy.radius + 2);
  ctx.stroke();
}

function drawRunnerHull(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  ctx.beginPath();
  ctx.moveTo(enemy.radius + 7, 0);
  ctx.lineTo(-enemy.radius, enemy.radius * 0.8);
  ctx.lineTo(-enemy.radius * 0.45, 0);
  ctx.lineTo(-enemy.radius, -enemy.radius * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = withAlpha(enemy.color, 0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-enemy.radius - 8, 0);
  ctx.lineTo(-enemy.radius - 18, 0);
  ctx.stroke();
}

function drawTankHull(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  elapsed: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * TAU) / 6;
    const px = Math.cos(angle) * enemy.radius;
    const py = Math.sin(angle) * enemy.radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.rotate(-enemy.angle);
  ctx.strokeStyle = withAlpha(enemy.color, 0.45);
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius + 7, elapsed * 0.9, elapsed * 0.9 + TAU * 0.72);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : withAlpha(enemy.color, 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, TAU);
  ctx.fill();
}

function drawSpitterHull(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.rotate(-enemy.angle);
  ctx.strokeStyle = withAlpha(enemy.color, 0.55);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius + 5, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : '#eafff0';
  ctx.beginPath();
  ctx.arc(0, 0, 5.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#08140c';
  ctx.beginPath();
  ctx.arc(0, 0, 2.3, 0, TAU);
  ctx.fill();
}

/** Hexagonal shell casing with a charged core and an orbiting ring. */
function drawSplitterHull(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  elapsed: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * TAU) / 6;
    const px = Math.cos(angle) * enemy.radius;
    const py = Math.sin(angle) * enemy.radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.rotate(-enemy.angle);
  const spin = elapsed * 1.1 + enemy.seed;
  ctx.strokeStyle = withAlpha(enemy.color, 0.55);
  ctx.lineWidth = 1.8;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius + 8, spin, spin + TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // Split hazard mark inside the casing.
  ctx.strokeStyle = withAlpha(enemy.color, 0.85);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(7, 0);
  ctx.lineTo(0, 7);
  ctx.lineTo(-7, 0);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : '#ffd9ac';
  ctx.beginPath();
  ctx.arc(0, 0, 3.6, 0, TAU);
  ctx.fill();
}

/**
 * Arrowhead hull with two side pods and a seeker eye: reads as a launcher
 * rather than a brawler.
 */
function drawHomingHull(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  elapsed: number,
) {
  const spin = elapsed * 0.9 + enemy.seed;
  ctx.strokeStyle = withAlpha(enemy.color, 0.4);
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius + 9, spin, spin + TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(enemy.radius * 1.15, 0);
  ctx.lineTo(-enemy.radius * 0.55, enemy.radius * 0.92);
  ctx.lineTo(-enemy.radius * 0.95, 0);
  ctx.lineTo(-enemy.radius * 0.55, -enemy.radius * 0.92);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Launch tubes either side of the hull.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(
      enemy.radius * 0.1,
      side * enemy.radius * 0.46 - 3,
      enemy.radius * 0.72,
      6,
      3,
    );
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : withAlpha(enemy.color, 0.9);
  ctx.beginPath();
  ctx.arc(enemy.radius * 0.2, 0, 4.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff0fb';
  ctx.beginPath();
  ctx.arc(enemy.radius * 0.2, 0, 1.9, 0, TAU);
  ctx.fill();
}

function drawBossHull(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  elapsed: number,
) {
  const spin = elapsed * 0.6;
  ctx.strokeStyle = withAlpha(enemy.color, 0.36);
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 9]);
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius + 16, spin, spin + TAU * 0.8);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = withAlpha(enemy.color, 0.55);
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * TAU) / 8;
    ctx.moveTo(
      Math.cos(angle) * (enemy.radius - 3),
      Math.sin(angle) * (enemy.radius - 3),
    );
    ctx.lineTo(
      Math.cos(angle) * (enemy.radius + 10),
      Math.sin(angle) * (enemy.radius + 10),
    );
  }
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * TAU) / 8;
    const px = Math.cos(angle) * enemy.radius;
    const py = Math.sin(angle) * enemy.radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = enemy.hitFlash > 0 ? '#ffffff' : enemy.color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.rotate(-enemy.angle);
  ctx.strokeStyle = withAlpha(enemy.color, 0.5);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius * 0.58, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : 'rgba(38, 3, 13, 0.94)';
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius * 0.34, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = withAlpha(enemy.color, 0.85);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : '#ffe4ea';
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, TAU);
  ctx.fill();
  ctx.fillStyle = enemy.color;
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, TAU);
  ctx.fill();

  ctx.rotate(enemy.angle);
  ctx.fillStyle = withAlpha(enemy.color, 0.24);
  ctx.strokeStyle = withAlpha(enemy.color, 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(enemy.radius * 0.62, -8, enemy.radius * 0.58, 16, 4);
  ctx.fill();
  ctx.stroke();
}

/** Boss wind-up, health bar and training-dummy marker. */
function drawEnemyStatus(world: GameWorld, enemy: Enemy) {
  const ctx = world.ctx;
  if (enemy.kind === 'boss' && world.bossWindup > 0) {
    const pulse = 0.5 + Math.sin(world.ambientTime * 24) * 0.28;
    const color = world.bossAttackKind === 'summon' ? '#ffc857' : BOSS_COLOR;
    ctx.save();
    ctx.strokeStyle = withAlpha(color, 0.82);
    ctx.lineWidth = 3 / world.zoom;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 20 + pulse * 8, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(color, 0.34);
    ctx.setLineDash([8 / world.zoom, 12 / world.zoom]);
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 34 + pulse * 10, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  if (enemy.kind !== 'boss' && enemy.hp < enemy.maxHp && enemy.age > 0.2) {
    const barWidth = Math.max(30, enemy.radius * 2.1);
    const barY = enemy.y - enemy.radius - 14;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(enemy.x - barWidth / 2, barY, barWidth, 4);
    ctx.fillStyle = enemy.color;
    ctx.fillRect(
      enemy.x - barWidth / 2,
      barY,
      barWidth * Math.max(0, enemy.hp / enemy.maxHp),
      4,
    );
  }

  if (enemy.dummy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.strokeStyle = withAlpha(enemy.color, 0.45);
    ctx.lineWidth = 1.5 / world.zoom;
    ctx.setLineDash([6 / world.zoom, 8 / world.zoom]);
    ctx.lineDashOffset = -world.ambientTime * 12;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 16, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = withAlpha(enemy.color, 0.9);
    ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('桩', 0, -enemy.radius - 28);
    ctx.restore();
  }
}

/** Wind-up telegraph and blade trail for the mob attack actions. */
function drawEnemyAttack(world: GameWorld, enemy: Enemy) {
  const brain = enemy.brain;
  if (!brain.started || brain.queue[brain.index] !== 'attack') return;
  if (brain.phase === 'recover') return;
  const atk = ENEMY_BEHAVIOR[enemy.kind].attack;
  const ctx = world.ctx;
  const color = enemy.color;

  ctx.save();
  if (brain.phase === 'windup') {
    const total = Math.max(0.001, atk.windup);
    const t = clamp(1 - brain.timer / total, 0, 1);
    drawAttackWindup(world, enemy, atk, color, t);
  } else if (atk.mode === 'sweep') {
    drawSweepAttack(world, enemy, atk);
  } else {
    ctx.strokeStyle = withAlpha(color, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      enemy.x,
      enemy.y,
      enemy.radius + 10 + Math.sin(world.elapsed * 30) * 3,
      0,
      TAU,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawAttackWindup(
  world: GameWorld,
  enemy: Enemy,
  atk: EnemyAttackDef,
  color: string,
  t: number,
) {
  const ctx = world.ctx;
  const target = enemyAttackPoint(world, enemy);
  ctx.strokeStyle = withAlpha(color, 0.16 + t * 0.34);
  ctx.lineWidth = 1.6 / world.zoom;
  ctx.setLineDash([7 / world.zoom, 9 / world.zoom]);
  ctx.beginPath();
  if (atk.mode === 'sweep') {
    ctx.arc(enemy.x, enemy.y, atk.reach, 0, TAU);
  } else if (atk.mode === 'shell') {
    // The shell lands on a snapshot, so a long aim line would lie; show a
    // short muzzle pointer plus a charging ring instead.
    const aim = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(
      enemy.x + Math.cos(aim) * (enemy.radius + 34),
      enemy.y + Math.sin(aim) * (enemy.radius + 34),
    );
  } else if (atk.mode === 'homing') {
    // The missile steers, so only the launch direction is promised.
    const aim = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(
      enemy.x + Math.cos(aim) * (enemy.radius + 22),
      enemy.y + Math.sin(aim) * (enemy.radius + 22),
    );
  } else {
    const aim = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(
      enemy.x + Math.cos(aim) * atk.reach * 0.55,
      enemy.y + Math.sin(aim) * atk.reach * 0.55,
    );
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (atk.mode === 'sweep') {
    // A marker races one full turn during the wind-up: this is a spin.
    const spin = enemy.angle - Math.PI + TAU * t;
    ctx.strokeStyle = withAlpha(color, 0.45 + t * 0.45);
    ctx.lineWidth = (2.5 + t * 2) / world.zoom;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, atk.reach * 0.94, spin, spin + 0.45 + t * 0.5);
    ctx.stroke();
  } else if (atk.mode === 'homing') {
    // Lock brackets close in on the attack target: this shot will chase.
    const lockRadius = 48 - t * 24;
    ctx.strokeStyle = withAlpha(color, 0.22 + t * 0.5);
    ctx.lineWidth = (1.4 + t * 1.2) / world.zoom;
    ctx.lineCap = 'round';
    for (let q = 0; q < 4; q++) {
      const start = q * (TAU / 4) + world.elapsed * 1.6;
      ctx.beginPath();
      ctx.arc(target.x, target.y, lockRadius, start, start + 0.4);
      ctx.stroke();
    }
  }
}

/** Swept sector, the blade edge and the full reach ring. */
function drawSweepAttack(world: GameWorld, enemy: Enemy, atk: EnemyAttackDef) {
  const ctx = world.ctx;
  const color = enemy.color;
  const brain = enemy.brain;

  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.beginPath();
  ctx.moveTo(enemy.x, enemy.y);
  ctx.arc(enemy.x, enemy.y, atk.reach, brain.sweepFrom, brain.sweepAngle);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = withAlpha(color, 0.4);
  ctx.lineWidth = 2 / world.zoom;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, atk.reach, brain.sweepFrom, brain.sweepAngle);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(color, 0.12);
  ctx.lineWidth = 1.4 / world.zoom;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, atk.reach, 0, TAU);
  ctx.stroke();

  const tipX = enemy.x + Math.cos(brain.sweepAngle) * atk.reach;
  const tipY = enemy.y + Math.sin(brain.sweepAngle) * atk.reach;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(enemy.x, enemy.y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(enemy.x, enemy.y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
}
