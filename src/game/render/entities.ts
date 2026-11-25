import { BOSS_COLOR, DASH_TIME, ENEMY_GLOW, PLAYER_COLOR } from '../core/config';
import { ENEMY_BEHAVIOR } from '../core/enemyDefs';
import type { Enemy } from '../core/entities';
import { TAU, clamp, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';
import { TURRET, WEAPONS } from '../weapons';

export function drawEnemies(world: GameWorld) {
  const ctx = world.ctx;
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    const spawnT = Math.min(1, enemy.age / 0.22);
    const scale = 0.55 + spawnT * 0.45;
    const alpha = spawnT;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.globalAlpha = alpha;

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

    if (enemy.kind === 'grunt') {
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
    } else if (enemy.kind === 'runner') {
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
    } else if (enemy.kind === 'tank') {
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
      ctx.arc(0, 0, enemy.radius + 7, world.elapsed * 0.9, world.elapsed * 0.9 + TAU * 0.72);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : withAlpha(enemy.color, 0.9);
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
    } else if (enemy.kind === 'spitter') {
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
    } else if (enemy.kind === 'splitter') {
      // Hexagonal shell casing with a charged core and an orbiting ring.
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
      const spin = world.elapsed * 1.1 + enemy.seed;
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
    } else if (enemy.kind === 'homing') {
      // Arrowhead hull with two side pods and a seeker eye: reads as a
      // launcher rather than a brawler.
      const spin = world.elapsed * 0.9 + enemy.seed;
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
    } else if (enemy.kind === 'boss') {
      const spin = world.elapsed * 0.6;
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

    ctx.restore();

    if (enemy.kind !== 'boss') drawEnemyAttack(world, enemy);

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
}

/** Wind-up telegraph and blade trail for the mob attack actions. */
export function drawEnemyAttack(world: GameWorld, enemy: Enemy) {
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
    ctx.strokeStyle = withAlpha(color, 0.16 + t * 0.34);
    ctx.lineWidth = 1.6 / world.zoom;
    ctx.setLineDash([7 / world.zoom, 9 / world.zoom]);
    ctx.beginPath();
    if (atk.mode === 'sweep') {
      ctx.arc(enemy.x, enemy.y, atk.reach, 0, TAU);
    } else if (atk.mode === 'shell') {
      // The shell lands on a snapshot, so a long aim line would lie; show a
      // short muzzle pointer plus a charging ring instead.
      const aim = Math.atan2(world.player.y - enemy.y, world.player.x - enemy.x);
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(
        enemy.x + Math.cos(aim) * (enemy.radius + 34),
        enemy.y + Math.sin(aim) * (enemy.radius + 34),
      );
    } else if (atk.mode === 'homing') {
      // The missile steers, so only the launch direction is promised.
      const aim = Math.atan2(world.player.y - enemy.y, world.player.x - enemy.x);
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(
        enemy.x + Math.cos(aim) * (enemy.radius + 22),
        enemy.y + Math.sin(aim) * (enemy.radius + 22),
      );
    } else {
      const aim = Math.atan2(world.player.y - enemy.y, world.player.x - enemy.x);
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
      // Lock brackets close in on the player: this shot will chase.
      const target = world.player;
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
  } else if (atk.mode === 'sweep') {
    // Swept sector, the blade edge and the full reach ring.
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

export function drawDashGhosts(world: GameWorld) {
  const ctx = world.ctx;

  // Launch ring: expands once from the point where the dodge started, which
  // stays put even while the ship slides away from it.
  if (world.dashRing.life > 0) {
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

  // Comet ribbon from the launch point to the live ship: the clearest
  // "this is a dodge, not a walk" cue while the slide is happening.
  const player = world.player;
  if (player.dashTime > 0 && world.dashRing.life > 0) {
    const dx = player.x - world.dashRing.x;
    const dy = player.y - world.dashRing.y;
    const span = Math.hypot(dx, dy);
    if (span > 4) {
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
  }

  if (world.dashTrail.life > 0) {
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

  if (!world.ghosts.length) return;
  ctx.save();
  for (const ghost of world.ghosts) {
    const t = clamp(ghost.life / ghost.maxLife, 0, 1);
    ctx.save();
    ctx.translate(ghost.x, ghost.y);
    ctx.rotate(ghost.angle);

    // Solid, darkened copy of the ship: the silhouette (hull, fins, barrel,
    // white core) is what makes an echo read as the player instead of a
    // string of glowing bubbles.
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

  if (player.dashTime > 0) {
    // Dodge wake: layered afterburner cones plus flickering jets, so an
    // ordinary stick move never looks like this.
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

  if (player.invuln > 0) {
    ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.45);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 27 + Math.sin(world.elapsed * 10) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.rotate(player.angle);
  ctx.globalAlpha = blink ? 0.55 : 1;

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

  // Muzzle flash
  if (player.muzzle > 0) {
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

  ctx.restore();
}

/** Sentry turrets: range hint, body and remaining HP. */
export function drawTurrets(world: GameWorld) {
  if (world.turrets.length === 0) return;
  const ctx = world.ctx;
  for (const turret of world.turrets) {
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
