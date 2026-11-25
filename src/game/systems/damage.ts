/** Damage application, deaths, pickups and player hits. */

import { PLAYER_COLOR } from '../core/config';
import type { Enemy, Turret } from '../core/entities';
import { rand } from '../core/math';
import type { GameWorld } from '../core/world';
import { bossDefeated } from './boss';
import { spawnBurst } from './fx';
import { emitHud } from './hud';
import { resetInputState } from './input';
import { maybeDropPickup } from './pickups';
import { countCleared } from './world';

export function playerHit(world: GameWorld, damage: number) {
  const player = world.player;
  if (player.dead || player.invuln > 0) return;
  player.hp -= damage;
  player.invuln = 0.95;
  world.combo = 0;
  world.comboTimer = 0;
  world.hurtFlash = 1;
  world.shake = Math.max(world.shake, 12);
  world.sfx.play('hurt');
  spawnBurst(world, player.x, player.y, '#ff4d7d', 18, 220, 0.5);
  world.floaters.push({
    x: player.x,
    y: player.y - 30,
    text: `-${damage}`,
    color: '#ff6f91',
    life: 0.8,
    maxLife: 0.8,
    size: 18,
  });

  if (player.hp <= 0) {
    player.hp = 0;
    player.dead = true;
    world.phase = 'gameover';
    resetInputState(world);
    world.shake = 24;
    spawnBurst(world, player.x, player.y, PLAYER_COLOR, 70, 420, 1.1);
    spawnBurst(world, player.x, player.y, '#ffffff', 26, 260, 0.8);
    world.enemyBullets = [];
    world.shells = [];
    world.homings = [];
    world.blasts = [];
    world.arcs = [];
    world.shockwaves = [];
    world.stormDarts = [];
    world.bombers = [];
    world.bombs = [];
    world.fireRings = [];
    world.laserBeams = [];
    world.laserCharge = 0;
    world.sfx.play('death');
    emitHud(world, true);
    world.callbacks.onGameOver(
      {
        mode: world.mode,
        score: world.score,
        kills: world.kills,
        time: world.elapsed,
        floor: world.floor,
        roomsCleared: countCleared(world),
        wave: world.testWave,
      },
      false,
    );
  } else {
    emitHud(world, true);
  }
}

export function damageTurret(world: GameWorld, turret: Turret, damage: number) {
  turret.hp -= damage;
  turret.hitFlash = 0.1;
  spawnBurst(world, turret.x, turret.y, turret.color, 4, 110, 0.25);
  if (turret.hp > 0) return;
  const index = world.turrets.indexOf(turret);
  if (index >= 0) world.turrets.splice(index, 1);
  spawnBurst(world, turret.x, turret.y, turret.color, 16, 220, 0.45);
  spawnBurst(world, turret.x, turret.y, '#ffffff', 8, 160, 0.3);
  world.shake = Math.max(world.shake, 3);
}

function killShake(enemy: Enemy) {
  if (enemy.kind === 'boss') return 20;
  if (enemy.kind === 'tank') return 7;
  return 3.2;
}

function killBurstCount(enemy: Enemy) {
  if (enemy.kind === 'boss') return 60;
  if (enemy.kind === 'tank') return 34;
  return 18;
}

export function damageEnemy(
  world: GameWorld,
  enemy: Enemy,
  damage: number,
  hitX: number,
  hitY: number,
  quiet = false,
) {
  if (enemy.dummy) {
    damageDummy(world, enemy, damage, hitX, hitY, quiet);
    return;
  }
  enemy.hp -= damage;
  enemy.hitFlash = 0.09;
  if (!quiet) {
    spawnBurst(world, hitX, hitY, enemy.color, 5, 130, 0.28);
    world.sfx.play('hit');
  }

  if (enemy.hp <= 0) {
    enemy.dead = true;
    // Missiles already in the air keep their locked target; they get the
    // death spot as their final waypoint and never pick a new enemy.
    for (const bullet of world.bullets) {
      const missile = bullet.missile;
      if (missile && !missile.dead && missile.targetId === enemy.id) {
        missile.dead = true;
        missile.x = enemy.x;
        missile.y = enemy.y;
      }
    }
    world.kills += 1;
    world.combo += 1;
    world.comboTimer = 3;
    const multiplier = 1 + Math.min(20, world.combo - 1) * 0.1;
    const points = Math.round(enemy.score * multiplier);
    world.score += points;
    world.killFlash = Math.max(world.killFlash, 0.35);
    world.shake = Math.max(world.shake, killShake(enemy));
    world.sfx.play('kill');
    spawnBurst(
      world,
      enemy.x,
      enemy.y,
      enemy.color,
      killBurstCount(enemy),
      250,
      0.65,
    );
    spawnBurst(world, enemy.x, enemy.y, '#ffffff', 5, 160, 0.35);
    world.floaters.push({
      x: enemy.x,
      y: enemy.y - enemy.radius - 4,
      text: `+${points}`,
      color: enemy.color,
      life: 0.9,
      maxLife: 0.9,
      size: 15,
    });
    if (enemy.kind === 'boss') {
      bossDefeated(world, enemy);
    } else {
      maybeDropPickup(world, enemy);
    }
  }
}

/**
 * Training dummy: takes visible damage but never awards kills, score, combo
 * or loot. When it breaks it simply waits, then a fresh one is set up.
 */
function damageDummy(
  world: GameWorld,
  enemy: Enemy,
  damage: number,
  hitX: number,
  hitY: number,
  quiet: boolean,
) {
  if (enemy.dead) return;
  enemy.hp = Math.max(0, enemy.hp - damage);
  enemy.hitFlash = 0.09;
  if (!quiet) {
    spawnBurst(world, hitX, hitY, enemy.color, 5, 130, 0.28);
    world.sfx.play('hit');
  }
  if (world.dummyFloatTimer <= 0) {
    world.dummyFloatTimer = 0.12;
    world.floaters.push({
      x: enemy.x + rand(-10, 10),
      y: enemy.y + enemy.radius + 18,
      text: damage >= 10 ? `${Math.round(damage)}` : damage.toFixed(1),
      color: '#ffe6c0',
      life: 0.55,
      maxLife: 0.55,
      size: 12,
    });
  }
  if (enemy.hp > 0) return;

  enemy.dead = true;
  world.dummyRespawn = 2.2;
  spawnBurst(world, enemy.x, enemy.y, enemy.color, 26, 240, 0.6);
  spawnBurst(world, enemy.x, enemy.y, '#ffffff', 10, 160, 0.4);
  world.floaters.push({
    x: enemy.x,
    y: enemy.y - enemy.radius - 28,
    text: '桩已击破',
    color: enemy.color,
    life: 1.2,
    maxLife: 1.2,
    size: 15,
  });
  world.shake = Math.max(world.shake, 4);
  world.sfx.play('kill');
}
