/** Boss attacks, defeat and run-end handling. */

import { BOSS_COLOR, BOSS_VICTORY_DELAY } from '../core/config';
import type { Enemy } from '../core/entities';
import { TAU, clamp, dist, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import type { EnemyKind } from '../types';
import { spawnBurst } from './fx';
import { emitHud } from './hud';
import { resetInputState } from './input';
import { spawnEnemy } from './spawn';
import { findNearestTurret } from './turrets';

export function updateBossAttack(world: GameWorld, enemy: Enemy, dt: number) {
  if (world.bossWindup > 0) {
    world.bossWindup = Math.max(0, world.bossWindup - dt);
    if (world.bossWindup <= 0) releaseBossAttack(world, enemy);
    return;
  }
  if (enemy.attackTimer > 0) return;

  const phase2 = enemy.hp <= enemy.maxHp * 0.5;
  const roll = Math.random();
  if (phase2 && roll < 0.24) {
    world.bossAttackKind = 'summon';
  } else {
    world.bossAttackKind = roll < 0.62 ? 'radial' : 'aimed';
  }
  world.bossWindup = phase2 ? 0.45 : 0.62;
  spawnBurst(world, enemy.x, enemy.y, BOSS_COLOR, 10, 130, 0.5);
  world.sfx.play('bossCharge');
}

function releaseBossAttack(world: GameWorld, enemy: Enemy) {
  const phase2 = enemy.hp <= enemy.maxHp * 0.5;
  const player = world.player;

  if (world.bossAttackKind === 'summon') {
    const minions = world.enemies.filter(
      (other) => !other.dead && other.kind !== 'boss',
    ).length;
    if (minions < 6) {
      for (let i = 0; i < 3; i++) {
        const angle = rand(0, TAU);
        const radius = rand(130, 230);
        const kind: EnemyKind = i === 1 ? 'runner' : 'grunt';
        spawnEnemy(world,
          kind,
          clamp(enemy.x + Math.cos(angle) * radius, 80, world.worldW - 80),
          clamp(enemy.y + Math.sin(angle) * radius, 80, world.worldH - 80),
        );
      }
    }
    enemy.attackTimer = rand(1.5, 2);
  } else if (world.bossAttackKind === 'radial') {
    const count = phase2 ? 20 : 14;
    const offset = rand(0, TAU);
    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * TAU;
      world.enemyBullets.push({
        x: enemy.x,
        y: enemy.y,
        prevX: enemy.x,
        prevY: enemy.y,
        vx: Math.cos(angle) * (phase2 ? 225 : 190),
        vy: Math.sin(angle) * (phase2 ? 225 : 190),
        radius: 7,
        damage: 9,
        life: 5,
        color: BOSS_COLOR,
      });
    }
    enemy.attackTimer = phase2 ? rand(1.15, 1.55) : rand(1.8, 2.3);
    world.shake = Math.max(world.shake, 7);
  } else {
    const count = phase2 ? 5 : 3;
    // The aimed volley also picks the nearest target, not just the player.
    const turret = findNearestTurret(world, enemy);
    const playerDist = player.dead
      ? Infinity
      : dist(enemy.x, enemy.y, player.x, player.y);
    const turretDist = turret
      ? dist(enemy.x, enemy.y, turret.x, turret.y)
      : Infinity;
    const target =
      turret && turretDist < playerDist ? turret : player;
    const base = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    for (let i = 0; i < count; i++) {
      const spread = i / (count - 1) - 0.5;
      const angle = base + spread * 0.32;
      world.enemyBullets.push({
        x: enemy.x + Math.cos(angle) * (enemy.radius - 4),
        y: enemy.y + Math.sin(angle) * (enemy.radius - 4),
        prevX: enemy.x,
        prevY: enemy.y,
        vx: Math.cos(angle) * 350,
        vy: Math.sin(angle) * 350,
        radius: 6.5,
        damage: 12,
        life: 3.2,
        color: '#ff8098',
      });
    }
    enemy.attackTimer = phase2 ? rand(1.1, 1.5) : rand(1.6, 2.1);
    world.shake = Math.max(world.shake, 5);
  }

  spawnBurst(world, enemy.x, enemy.y, phase2 ? '#ff8098' : BOSS_COLOR, 18, 220, 0.55);
  world.sfx.play('bossAttack');
  emitHud(world, true);
}

export function bossDefeated(world: GameWorld, boss: Enemy) {
  world.victoryTimer = BOSS_VICTORY_DELAY;
  world.bossWindup = 0;
  world.player.invuln = Math.max(world.player.invuln, BOSS_VICTORY_DELAY + 1);
  world.enemyBullets = [];
  world.shells = [];
  world.homings = [];
  world.blasts = [];

  for (const enemy of world.enemies) {
    if (enemy === boss || enemy.dead) continue;
    enemy.dead = true;
    spawnBurst(world, enemy.x, enemy.y, enemy.color, 14, 220, 0.6);
  }

  world.shake = 26;
  world.killFlash = 1;
  spawnBurst(world, boss.x, boss.y, BOSS_COLOR, 86, 460, 1.3);
  spawnBurst(world, boss.x, boss.y, '#ffffff', 34, 300, 0.9);
  world.banner = {
    title: 'BOSS DOWN',
    sub: '压制核心已沉默',
    time: 2.2,
    duration: 2.2,
    color: '#7dff9b',
  };
  world.sfx.play('bossDown');
  emitHud(world, true);
}

export function finishBossFight(world: GameWorld) {
  if (world.phase !== 'playing') return;
  world.phase = 'gameover';
  resetInputState(world);
  emitHud(world, true);
  world.callbacks.onGameOver(
    {
      mode: 'boss',
      score: world.score,
      kills: world.kills,
      time: world.elapsed,
      floor: 1,
      roomsCleared: 0,
      wave: world.testWave,
    },
    true,
  );
}
