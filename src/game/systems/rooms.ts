/** Dungeon rooms, encounters, portal and test-room waves. */

import {
  CLEAR_HEAL,
  DUNGEON_ROOMS,
  FLOOR_HEAL,
  PLAYER_COLOR,
  PLAYER_SPEED,
  PLAYER_START_ANGLE,
  PORTAL_RADIUS,
  PORTAL_X,
  PORTAL_Y,
  ROOM_SIZE,
  TEST_COLOR,
} from '../core/config';
import type { Player } from '../core/entities';
import { TAU, clamp, dist, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import type { EnemyKind } from '../types';
import { ENEMY_LABELS } from '../types';
import { spawnBurst } from './fx';
import { clearFunnels } from './funnels';
import { emitHud } from './hud';
import { resetInputState } from './input';
import { dropPickup } from './pickups';
import { pickSpawnPoint, spawnDummy, spawnEnemy, updateDummy } from './spawn';
import {
  buildDecorations,
  clampCamera,
  countCleared,
  resetCameraBias,
  roomBounds,
} from './world';

export function resetWorld(world: GameWorld) {
  world.player = createPlayer(world);
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;
  resetCameraBias(world);
  resetCombatState(world);
  resetRunState(world);
  world.hudTimer = 0;
  resetInputState(world);
}

function createPlayer(world: GameWorld): Player {
  return {
    x: world.mode === 'boss' ? world.worldW / 2 : ROOM_SIZE / 2,
    y: world.worldH / 2,
    vx: 0,
    vy: 0,
    knockX: 0,
    knockY: 0,
    radius: 17,
    hp: 100,
    maxHp: 100,
    speed: PLAYER_SPEED,
    angle: PLAYER_START_ANGLE,
    // A dodge before the player ever moves follows the starting facing (up).
    lastMoveX: Math.cos(PLAYER_START_ANGLE),
    lastMoveY: Math.sin(PLAYER_START_ANGLE),
    fireCooldown: 0,
    invuln: 0,
    muzzle: 0,
    muzzleColor: PLAYER_COLOR,
    trailTimer: 0,
    dashTime: 0,
    dashDirX: 0,
    dashDirY: 0,
    weapon: world.mode === 'boss' ? (world.weaponPool[0] ?? 'pulse') : 'pulse',
    dead: false,
  };
}

/** Clear every projectile, effect and summon from the previous run. */
function resetCombatState(world: GameWorld) {
  world.enemies = [];
  world.dummy = null;
  world.dummyFloatTimer = 0;
  world.dropHits = 0;
  world.lobItems = [];
  world.bullets = [];
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
  world.volleyShots = 0;
  world.volleyFiring = false;
  world.turrets = [];
  world.nextTurretId = 1;
  clearFunnels(world);
  world.orbitAngle = 0;
  world.orbitRadius = 0;
  world.orbitExpand = 0;
  world.orbitActive = 0;
  world.particles = [];
  world.ghosts = [];
  world.dashGhostTimer = 0;
  world.dashRing.life = 0;
  world.dashFlash = 0;
  world.dashTrail.life = 0;
  world.floaters = [];
  world.pickups = [];
  world.telegraphs = [];
  world.banner = null;
  world.boss = null;
  world.bossWindup = 0;
  world.bossAttackKind = 'radial';
  world.victoryTimer = 0;
}

/** Reset score, floor progress and screen-effect timers for a new run. */
function resetRunState(world: GameWorld) {
  world.score = 0;
  world.kills = 0;
  world.combo = 0;
  world.comboTimer = 0;
  world.floor = 1;
  world.roomIndex = 0;
  world.roomCleared = [false, false, false, false, false];
  world.encounterActive = false;
  world.spawnQueue = [];
  world.spawnTimer = 0;
  world.elapsed = 0;
  world.shake = 0;
  world.hurtFlash = 0;
  world.healFlash = 0;
  world.killFlash = 0;
  world.autoTarget = null;
  world.autoAimX = 0;
  world.autoAimY = 0;
  world.secondaryCooldown = 0;
  world.dodgeCooldown = 0;
  world.bomberCooldown = 0;
  world.flameTick = 0;
}

export function beginTestRoom(world: GameWorld) {
  world.spawnQueue = [];
  world.spawnTimer = 0;
  world.bossWindup = 0;
  world.boss = null;
  world.testWave = 0;
  world.testWaveTimer = 0;
  spawnTestWave(world);
  const roster = world.testEnemies.map((kind) => ENEMY_LABELS[kind]).join(' · ');
  world.banner = {
    title: 'TEST ROOM',
    sub:
      world.testEnemies.length <= 3
        ? `${roster} · 清空自动续波`
        : `测试场 · 已选 ${world.testEnemies.length} 种敌人 · 清空自动续波`,
    time: 2,
    duration: 2,
    color: TEST_COLOR,
  };
  world.sfx.play('wave');
  emitHud(world, true);
}

function spawnTestWave(world: GameWorld) {
  world.testWave += 1;
  // Wave 1 opens with two, then one more per wave up to a ceiling.
  const count = Math.min(6, world.testWave + 1);
  const cx = world.worldW / 2;
  const cy = world.worldH / 2;
  for (let i = 0; i < count; i++) {
    const angle = (TAU * i) / count + world.testWave * 0.45 + rand(-0.12, 0.12);
    const radius = 280 + rand(0, 90);
    // Round-robin the picked enemies so a wave always shows the mix.
    const kind = world.testEnemies[i % world.testEnemies.length];
    spawnEnemy(world,
      kind,
      clamp(cx + Math.cos(angle) * radius, 80, world.worldW - 80),
      clamp(cy + Math.sin(angle) * radius, 80, world.worldH - 80),
    );
  }
  world.testWaveTimer = 1.6;
  emitHud(world, true);
}

export function updateTestRoom(world: GameWorld, dt: number) {
  if (world.phase !== 'playing') return;
  if (world.enemies.some((enemy) => !enemy.dead)) {
    world.testWaveTimer = 1.6;
    return;
  }
  world.testWaveTimer -= dt;
  if (world.testWaveTimer <= 0) spawnTestWave(world);
}

// ------------------------------------------------------------- dungeon logic
export function beginRun(world: GameWorld) {
  world.floor = 1;
  world.roomIndex = 0;
  world.roomCleared = [false, false, false, false, false];
  world.encounterActive = false;
  world.spawnQueue = [];
  world.spawnTimer = 0;
  world.banner = {
    title: 'FLOOR 01',
    sub: '起始房 · 沿右侧闸门深入',
    time: 2.4,
    duration: 2.4,
    color: PLAYER_COLOR,
  };
  world.sfx.play('wave');
  spawnDummy(world);
  emitHud(world, true);
}

export function updateDungeon(world: GameWorld, dt: number) {
  if (world.roomIndex === 0) updateDummy(world, dt);
  if (world.encounterActive) {
    updateEncounter(world, dt);
  } else if (
    world.roomIndex >= 1 &&
    world.roomIndex <= DUNGEON_ROOMS - 2 &&
    !world.roomCleared[world.roomIndex]
  ) {
    startEncounter(world, world.roomIndex);
  }
  updatePortal(world);
}

function startEncounter(world: GameWorld, room: number) {
  world.encounterActive = true;
  world.spawnQueue = buildEncounter(world.floor, room);
  world.spawnTimer = 0.55;
  world.telegraphs = [];
  world.banner = {
    title: `ROOM 0${room}`,
    sub: room === 1 ? '敌对信号锁定 · 闸门闭合' : `第 ${world.floor} 层 · 战斗房 ${room}/3`,
    time: 1.9,
    duration: 1.9,
    color: '#ff5f7d',
  };
  world.sfx.play('wave');
  emitHud(world, true);
}

function buildEncounter(floor: number, room: number): EnemyKind[] {
  const count = Math.min(
    32,
    6 + (floor - 1) * 3 + room * 2 + Math.floor(Math.random() * 3),
  );
  const list: EnemyKind[] = [];
  const spitters = floor >= 2 || room >= 3;
  const tanks = floor >= 3 || (floor >= 2 && room >= 3);
  const splitters = floor >= 2 || room >= 3;
  const homings = floor >= 2 && room >= 2;
  for (let i = 0; i < count; i++) {
    let kind: EnemyKind = 'grunt';
    if (tanks && i % 7 === 3) kind = 'tank';
    else if (homings && i % 8 === 6) kind = 'homing';
    else if (splitters && i % 6 === 4) kind = 'splitter';
    else if (spitters && i % 5 === 2) kind = 'spitter';
    else if (room >= 2 || floor >= 2 ? i % 3 === 1 : i % 5 === 3) kind = 'runner';
    list.push(kind);
  }
  if (spitters && !list.includes('spitter')) list[Math.min(2, list.length - 1)] = 'spitter';
  if (splitters && !list.includes('splitter')) {
    list[Math.min(3, list.length - 1)] = 'splitter';
  }
  if (homings && !list.includes('homing')) {
    list[Math.min(5, list.length - 1)] = 'homing';
  }
  if (tanks && !list.includes('tank')) list[Math.min(4, list.length - 1)] = 'tank';

  // Shuffle so every room opens a little differently.
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function updateEncounter(world: GameWorld, dt: number) {
  world.spawnTimer -= dt;
  if (world.spawnQueue.length > 0 && world.spawnTimer <= 0) {
    const groupSize = Math.min(
      world.spawnQueue.length,
      1 + Math.floor((world.floor - 1) / 2) + (world.roomIndex >= 3 ? 1 : 0),
    );
    for (let i = 0; i < groupSize; i++) {
      const kind = world.spawnQueue.shift();
      if (!kind) break;
      const point = pickSpawnPoint(world);
      world.telegraphs.push({
        x: point.x,
        y: point.y,
        kind,
        timer: 0.65,
        duration: 0.65,
      });
    }
    world.spawnTimer = Math.max(0.4, 0.86 - world.floor * 0.05);
  }

  for (let i = world.telegraphs.length - 1; i >= 0; i--) {
    const telegraph = world.telegraphs[i];
    telegraph.timer -= dt;
    if (telegraph.timer <= 0) {
      spawnEnemy(world, telegraph.kind, telegraph.x, telegraph.y);
      world.telegraphs.splice(i, 1);
    }
  }

  if (
    world.spawnQueue.length === 0 &&
    world.telegraphs.length === 0 &&
    world.enemies.length === 0
  ) {
    clearRoom(world);
  }
}

function clearRoom(world: GameWorld) {
  world.encounterActive = false;
  world.roomCleared[world.roomIndex] = true;
  const cleared = countCleared(world);
  const bonus = 80 + world.floor * 25 + world.roomIndex * 15;
  world.score += bonus;
  world.player.hp = Math.min(world.player.maxHp, world.player.hp + CLEAR_HEAL);
  world.healFlash = Math.max(world.healFlash, 0.45);
  const allCleared = cleared >= DUNGEON_ROOMS - 2;
  world.banner = {
    title: allCleared ? 'FLOOR CLEAR' : 'ROOM CLEAR',
    sub: allCleared
      ? `传送门已激活 · 房间奖励 +${bonus}`
      : `战斗房 ${cleared}/3 · 闸门开启 · +${bonus}`,
    time: 2.7,
    duration: 2.7,
    color: '#7dff9b',
  };
  if (world.player.hp < world.player.maxHp * 0.7 && world.pickups.length < 2) {
    const bounds = roomBounds(world);
    dropPickup(world,
      clamp(world.player.x + rand(-110, 110), bounds.left + 40, bounds.right - 40),
      clamp(world.player.y + rand(-110, 110), bounds.top + 40, bounds.bottom - 40),
    );
  }
  world.sfx.play('clear');
  emitHud(world, true);
}

function updatePortal(world: GameWorld) {
  if (countCleared(world) < DUNGEON_ROOMS - 2) return;
  if (world.roomIndex !== DUNGEON_ROOMS - 1) return;
  const reach = PORTAL_RADIUS + world.player.radius;
  if (dist(world.player.x, world.player.y, PORTAL_X, PORTAL_Y) <= reach) {
    nextFloor(world);
  }
}

function nextFloor(world: GameWorld) {
  world.floor += 1;
  world.roomCleared = [false, false, false, false, false];
  world.roomIndex = 0;
  world.encounterActive = false;
  world.spawnQueue = [];
  world.telegraphs = [];
  world.enemies = [];
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
  world.turrets = [];
  clearFunnels(world);
  world.orbitActive = 0;
  world.orbitExpand = 0;
  world.bullets = [];
  world.pickups = [];
  world.player.x = ROOM_SIZE / 2;
  world.player.y = world.worldH / 2;
  world.player.invuln = 1.2;
  // Nothing from the previous floor should linger at the old coordinates.
  world.ghosts = [];
  world.dashTrail.life = 0;
  world.dashRing.life = 0;
  world.player.hp = Math.min(world.player.maxHp, world.player.hp + FLOOR_HEAL);
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;
  resetCameraBias(world);
  clampCamera(world);
  world.score += 150 * world.floor;
  world.healFlash = 1;
  spawnBurst(world, world.player.x, world.player.y, '#c08bff', 42, 300, 0.9);
  world.banner = {
    title: `FLOOR ${String(world.floor).padStart(2, '0')}`,
    sub: `传送完成 · 装甲修复 +${FLOOR_HEAL}`,
    time: 2.4,
    duration: 2.4,
    color: '#c08bff',
  };
  buildDecorations(world);
  world.sfx.play('clear');
  emitHud(world, true);
}
