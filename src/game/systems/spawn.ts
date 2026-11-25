/** Spawns enemies and the training dummy. */

import { DUMMY_X, DUMMY_Y } from '../core/config';
import { ENEMY_DEFS } from '../core/enemyDefs';
import { createEnemyBrain } from '../core/entities';
import { TAU, dist, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import type { EnemyKind } from '../types';
import { spawnBurst } from './fx';
import { roomBounds } from './world';

export function pickSpawnPoint(world: GameWorld) {
  const bounds = roomBounds(world);
  let best = {
    x: world.player.x + 300,
    y: world.player.y,
  };
  let bestScore = -1;
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = rand(bounds.left + 70, bounds.right - 70);
    const y = rand(bounds.top + 70, bounds.bottom - 70);
    const d = dist(x, y, world.player.x, world.player.y);
    const score = d < 300 ? d : 1000 + Math.min(d, 700);
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
    if (d > 360) return best;
  }
  return best;
}

export function spawnEnemy(world: GameWorld, kind: EnemyKind, x: number, y: number) {
  const def = ENEMY_DEFS[kind];
  const depth =
    world.mode === 'dungeon' ? (world.floor - 1) * 3 + world.roomIndex : 1;
  const bonusHp =
    kind === 'tank'
      ? depth - 1
      : kind === 'spitter'
        ? Math.floor((depth - 1) / 2)
        : Math.floor((depth - 1) / 3);
  const hp = def.hp + bonusHp;
  world.enemies.push({
    id: world.nextEnemyId++,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    knockX: 0,
    knockY: 0,
    radius: def.radius,
    hp,
    maxHp: hp,
    speed: def.speed * (1 + Math.min(0.3, depth * 0.02)),
    damage: def.damage,
    score: def.score,
    color: def.color,
    angle: 0,
    attackTimer: rand(0.8, 2.2),
    hitFlash: 0,
    orbitCooldown: 0,
    summonHits: 0,
    age: 0,
    seed: rand(0, TAU),
    brain: createEnemyBrain(),
    desiredX: 0,
    desiredY: 0,
    desiredSpeed: 0,
    turnRate: 4,
    dead: false,
  });
  spawnBurst(world, x, y, def.color, 12, 180, 0.45);
}

/**
 * Practice dummy for the dungeon start room. It uses a tank body so every
 * weapon can lock and hit it, but has no AI, no contact damage and no
 * rewards; breaking it just schedules a fresh one.
 */
export function spawnDummy(world: GameWorld) {
  removeDummy(world);
  spawnEnemy(world, 'tank', DUMMY_X, DUMMY_Y);
  const dummy = world.enemies[world.enemies.length - 1];
  if (!dummy) return;
  dummy.dummy = true;
  dummy.hp = 240;
  dummy.maxHp = 240;
  dummy.damage = 0;
  dummy.speed = 0;
  dummy.score = 0;
  dummy.color = '#ffcf6b';
  dummy.angle = -Math.PI / 2;
  dummy.brain.queue = [];
  dummy.brain.started = false;
  world.dummy = dummy;
  world.dummyRespawn = 0;
}

export function removeDummy(world: GameWorld) {
  if (!world.dummy) return;
  const index = world.enemies.indexOf(world.dummy);
  if (index >= 0) world.enemies.splice(index, 1);
  world.dummy = null;
  world.dummyRespawn = 0;
}

export function updateDummy(world: GameWorld, dt: number) {
  world.dummyFloatTimer = Math.max(0, world.dummyFloatTimer - dt);
  if (world.dummy && !world.dummy.dead) return;
  world.dummyRespawn = Math.max(0, world.dummyRespawn - dt);
  if (world.dummyRespawn > 0) return;
  const broken = world.dummy !== null;
  spawnDummy(world);
  if (broken) {
    world.floaters.push({
      x: DUMMY_X,
      y: DUMMY_Y - 46,
      text: '桩已重置',
      color: '#ffcf6b',
      life: 1,
      maxLife: 1,
      size: 13,
    });
  }
}
