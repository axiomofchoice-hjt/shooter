/** Enemy AI, movement and attack actions. */

import {
  ENEMY_APPROACH_CHANCE,
  ENEMY_IDLE_JITTER,
  ENEMY_LANE_PAD,
  ENEMY_LEGS_MAX,
  ENEMY_LEGS_MIN,
  ENEMY_LEG_TIMEOUT,
  ENEMY_RING_MAX,
  ENEMY_RING_MIN,
  HOMING_LIFE,
  HOMING_RADIUS,
  HOMING_SEEK_TIME,
  HOMING_SPEED,
  SHELL_FLIGHT_TIME,
  SHELL_RADIUS,
  SHELL_SPEED,
} from '../core/config';
import type { EnemyAction, EnemyAttackDef } from '../core/enemyDefs';
import { ENEMY_ACTIONS, ENEMY_BEHAVIOR } from '../core/enemyDefs';
import type { Enemy } from '../core/entities';
import { TAU, clamp, dist, rand, segmentCircleHit, turnTowards } from '../core/math';
import type { GameWorld } from '../core/world';
import { TURRET } from '../weapons';
import { updateBossAttack } from './boss';
import { compactEnemies } from './combat';
import { damageTurret, playerHit } from './damage';
import { spawnBurst } from './fx';
import { enemyAttackPoint, findTauntTurret, turretById } from './turrets';
import type { RoomBounds } from './world';
import { roomBounds } from './world';

// ------------------------------------------------------------------ enemies
export function updateEnemies(world: GameWorld, dt: number) {
  const bounds = roomBounds(world);
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    enemy.age += dt;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    if (enemy.dummy) continue;
    updateEnemy(world, enemy, bounds, dt);
  }
  separateEnemies(world);
  compactEnemies(world);
}

function updateEnemy(
  world: GameWorld,
  enemy: Enemy,
  bounds: RoomBounds,
  dt: number,
) {
  const player = world.player;
  enemy.attackTimer -= dt;

  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / distance;
  const ny = dy / distance;

  enemy.desiredX = 0;
  enemy.desiredY = 0;
  enemy.desiredSpeed = 0;
  enemy.turnRate = 4;
  let aimAtPlayer = true;

  if (enemy.kind === 'boss') {
    moveBoss(world, enemy, nx, ny, distance, dt);
  } else {
    aimAtPlayer = updateEnemyBrain(world, enemy, dt, distance);
  }

  const desiredLen = Math.hypot(enemy.desiredX, enemy.desiredY);
  if (desiredLen > 0.001) {
    enemy.desiredX /= desiredLen;
    enemy.desiredY /= desiredLen;
  } else {
    enemy.desiredX = 0;
    enemy.desiredY = 0;
  }
  applyEnemyMotion(enemy, bounds, dt);
  faceEnemy(world, enemy, aimAtPlayer, dt);
  hitPlayerOnContact(world, enemy, nx, ny, distance);
}

function moveBoss(
  world: GameWorld,
  enemy: Enemy,
  nx: number,
  ny: number,
  distance: number,
  dt: number,
) {
  enemy.angle = Math.atan2(world.player.y - enemy.y, world.player.x - enemy.x);
  if (distance > 300) {
    enemy.desiredX = nx;
    enemy.desiredY = ny;
  } else if (distance < 185) {
    enemy.desiredX = -nx;
    enemy.desiredY = -ny;
  } else {
    const strafe = Math.sin(world.elapsed * 0.9 + enemy.seed) > 0 ? 1 : -1;
    enemy.desiredX = -ny * strafe * 0.85 + nx * 0.1;
    enemy.desiredY = nx * strafe * 0.85 + ny * 0.1;
  }
  const phase2 = enemy.hp <= enemy.maxHp * 0.5;
  enemy.desiredSpeed = enemy.speed * (phase2 ? 1.32 : 1);
  if (!world.player.dead) updateBossAttack(world, enemy, dt);
}

function applyEnemyMotion(
  enemy: Enemy,
  bounds: RoomBounds,
  dt: number,
) {
  const turn = 1 - Math.exp(-enemy.turnRate * dt);
  enemy.vx += (enemy.desiredX * enemy.desiredSpeed - enemy.vx) * turn;
  enemy.vy += (enemy.desiredY * enemy.desiredSpeed - enemy.vy) * turn;
  enemy.x += (enemy.vx + enemy.knockX) * dt;
  enemy.y += (enemy.vy + enemy.knockY) * dt;
  const knockDecay = Math.exp(-5 * dt);
  enemy.knockX *= knockDecay;
  enemy.knockY *= knockDecay;
  if (Math.abs(enemy.knockX) < 0.5) enemy.knockX = 0;
  if (Math.abs(enemy.knockY) < 0.5) enemy.knockY = 0;
  enemy.x = clamp(enemy.x, bounds.left + 18, bounds.right - 18);
  enemy.y = clamp(enemy.y, bounds.top + 18, bounds.bottom - 18);
}

function faceEnemy(world: GameWorld, enemy: Enemy, aimAtPlayer: boolean, dt: number) {
  if (enemy.kind === 'boss') return;
  if (aimAtPlayer) {
    const target = enemyAttackPoint(world, enemy);
    enemy.angle = turnTowards(
      enemy.angle,
      Math.atan2(target.y - enemy.y, target.x - enemy.x),
      1 - Math.exp(-10 * dt),
    );
  } else if (Math.hypot(enemy.vx, enemy.vy) > 26) {
    enemy.angle = turnTowards(
      enemy.angle,
      Math.atan2(enemy.vy, enemy.vx),
      1 - Math.exp(-6 * dt),
    );
  }
}

function hitPlayerOnContact(
  world: GameWorld,
  enemy: Enemy,
  nx: number,
  ny: number,
  distance: number,
) {
  const player = world.player;
  if (
    enemy.age <= 0.18 ||
    enemy.dummy ||
    player.dead ||
    distance >= enemy.radius + player.radius - 2
  ) {
    return;
  }
  if (player.invuln > 0) return;
  playerHit(world, enemy.damage);
  const push = 140;
  enemy.vx -= nx * push;
  enemy.vy -= ny * push;
  // Impact force is an external impulse, so it still shoves the player
  // even though normal movement has no inertia.
  player.knockX += nx * 240;
  player.knockY += ny * 240;
}

/** Soft separation keeps the horde readable. */
function separateEnemies(world: GameWorld) {
  for (let i = 0; i < world.enemies.length; i++) {
    const a = world.enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < world.enemies.length; j++) {
      const b = world.enemies[j];
      if (b.dead || a.kind === 'boss' || b.kind === 'boss') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = (a.radius + b.radius) * 0.88;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.001 && d2 < minDist * minDist) {
        const d = Math.sqrt(d2);
        const overlap = (minDist - d) * 0.5;
        const px = (dx / d) * overlap;
        const py = (dy / d) * overlap;
        a.x -= px;
        a.y -= py;
        b.x += px;
        b.y += py;
      }
    }
  }
}

/**
 * Advances the enemy's move / attack / idle rotation. Returns true while the
 * enemy is attacking, which makes it face the player instead of its heading.
 */
function updateEnemyBrain(
  world: GameWorld,
  enemy: Enemy,
  dt: number,
  distance: number,
): boolean {
  const brain = enemy.brain;
  let guard = 0;
  while (guard++ < 8) {
    if (brain.index >= brain.queue.length) {
      brain.queue = rollEnemyActions();
      brain.index = 0;
      brain.started = false;
    }
    if (!brain.started) {
      brain.started = true;
      beginEnemyAction(world, enemy, brain.queue[brain.index]);
    }
    if (tickEnemyAction(world, enemy, dt, distance)) {
      return brain.queue[brain.index] === 'attack';
    }
    brain.index += 1;
    brain.started = false;
  }
  return false;
}

/** One move, one attack and two idle actions in a random order. */
function rollEnemyActions(): EnemyAction[] {
  const queue = ENEMY_ACTIONS.slice();
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = queue[i];
    queue[i] = queue[j];
    queue[j] = swap;
  }
  return queue;
}

function beginEnemyAction(world: GameWorld, enemy: Enemy, action: EnemyAction) {
  if (action === 'move') {
    beginEnemyMove(world, enemy);
    return;
  }
  if (action === 'attack') {
    // A turret nearby pulls this attack off the player.
    enemy.brain.turretId = findTauntTurret(world, enemy)?.id;
    const atk = ENEMY_BEHAVIOR[enemy.kind].attack;
    enemy.brain.phase = 'windup';
    enemy.brain.timer = atk.windup * rand(0.9, 1.1);
    return;
  }
  // Idle: random duration whose expectation matches one straight-line hop.
  const brain = enemy.brain;
  const def = ENEMY_BEHAVIOR[enemy.kind];
  const mean =
    brain.lastLegTime > 0.05
      ? brain.lastLegTime
      : (brain.ringRadius > 0 ? brain.ringRadius : (ENEMY_RING_MIN + ENEMY_RING_MAX) / 2) /
        Math.max(1, def.moveSpeed);
  brain.idleTimer = clamp(
    mean * rand(1 - ENEMY_IDLE_JITTER, 1 + ENEMY_IDLE_JITTER),
    0.35,
    2.6,
  );
}

function beginEnemyMove(world: GameWorld, enemy: Enemy) {
  const brain = enemy.brain;
  brain.legsLeft =
    ENEMY_LEGS_MIN + Math.floor(Math.random() * (ENEMY_LEGS_MAX - ENEMY_LEGS_MIN + 1));
  beginEnemyLeg(world, enemy, dist(enemy.x, enemy.y, world.player.x, world.player.y));
}

function beginEnemyLeg(world: GameWorld, enemy: Enemy, distance: number) {
  const brain = enemy.brain;
  const def = ENEMY_BEHAVIOR[enemy.kind];
  const bounds = roomBounds(world);
  const player = world.player;

  // Each hop starts where the previous one ended; the ring is built around
  // that spot and a bigger enemy paces a wider ring.
  brain.anchorX = enemy.x;
  brain.anchorY = enemy.y;
  brain.ringRadius =
    rand(ENEMY_RING_MIN, ENEMY_RING_MAX) * clamp(enemy.radius / 16, 0.8, 1.5);

  // Random point on the ring around the anchor. The player-facing direction
  // is the one that corrects the distance to the preferred range; 80% of the
  // hops take it, 20% take the same vector reversed, away from the range.
  const toPlayer = Math.atan2(player.y - brain.anchorY, player.x - brain.anchorX);
  const tooFar = distance > def.range;
  const corrective = tooFar ? toPlayer : toPlayer + Math.PI;
  const reversed = Math.random() >= ENEMY_APPROACH_CHANCE;
  let angle = reversed ? corrective + Math.PI : corrective;
  // Do not overshoot the preferred range and barge into the player.
  const hopLen =
    tooFar !== reversed
      ? Math.min(brain.ringRadius, Math.max(26, distance - def.range))
      : brain.ringRadius;
  // Still a ring pick, not a pure radial line.
  angle += rand(-0.6, 0.6);

  // Never aim outside the room: swing the hop toward the room centre until
  // the ring point fits, instead of clamping it onto the wall.
  const pad = ENEMY_LANE_PAD + enemy.radius;
  const fits = (a: number) => {
    const x = brain.anchorX + Math.cos(a) * hopLen;
    const y = brain.anchorY + Math.sin(a) * hopLen;
    return (
      x >= bounds.left + pad &&
      x <= bounds.right - pad &&
      y >= bounds.top + pad &&
      y <= bounds.bottom - pad
    );
  };
  if (!fits(angle)) {
    const toCentre = Math.atan2(
      (bounds.top + bounds.bottom) / 2 - brain.anchorY,
      (bounds.left + bounds.right) / 2 - brain.anchorX,
    );
    const delta = ((((toCentre - angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    for (let step = 1; step <= 8; step++) {
      const probe = angle + delta * (step / 8);
      if (fits(probe)) {
        angle = probe;
        break;
      }
    }
  }

  brain.targetX = clamp(
    brain.anchorX + Math.cos(angle) * hopLen,
    bounds.left + pad,
    bounds.right - pad,
  );
  brain.targetY = clamp(
    brain.anchorY + Math.sin(angle) * hopLen,
    bounds.top + pad,
    bounds.bottom - pad,
  );

  const hop = Math.max(12, dist(brain.targetX, brain.targetY, enemy.x, enemy.y));
  brain.legSpeed = def.moveSpeed * rand(0.9, 1.15);
  brain.legTime = hop / brain.legSpeed;
  brain.legTimer = brain.legTime * ENEMY_LEG_TIMEOUT + 0.3;
  brain.lastLegTime = brain.legTime;
}

function tickEnemyAction(
  world: GameWorld,
  enemy: Enemy,
  dt: number,
  distance: number,
): boolean {
  const brain = enemy.brain;
  const action = brain.queue[brain.index];

  if (action === 'move') {
    const dx = brain.targetX - enemy.x;
    const dy = brain.targetY - enemy.y;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
      enemy.desiredX = dx / d;
      enemy.desiredY = dy / d;
      // Ease into the ring point instead of overshooting it.
      enemy.desiredSpeed = brain.legSpeed * clamp(d / 34, 0.35, 1);
    }
    brain.legTimer -= dt;
    if (d <= 8 || brain.legTimer <= 0) {
      brain.legsLeft -= 1;
      if (brain.legsLeft <= 0) return false;
      beginEnemyLeg(world, enemy, distance);
    }
    return true;
  }

  if (action === 'attack') {
    const atk = ENEMY_BEHAVIOR[enemy.kind].attack;
    enemy.turnRate = 10;
    if (brain.phase === 'windup') {
      brain.timer -= dt;
      if (brain.timer <= 0) {
        brain.phase = 'active';
        brain.timer = atk.active;
        if (atk.mode !== 'sweep') {
          brain.shotsLeft = atk.shots;
          brain.fireTimer = 0;
        } else {
          // Start the blade behind the enemy and sweep one full turn.
          brain.sweepFrom = enemy.angle - Math.PI;
          brain.sweepAngle = brain.sweepFrom;
          brain.sweepHit = false;
          world.sfx.play('sweep');
        }
      }
      return true;
    }
    if (brain.phase === 'active') {
      brain.timer -= dt;
      if (atk.mode !== 'sweep') {
        brain.fireTimer -= dt;
        if (brain.shotsLeft > 0 && brain.fireTimer <= 0) {
          fireEnemyShot(world, enemy, atk);
          brain.shotsLeft -= 1;
          brain.fireTimer = atk.interval;
        }
      } else {
        const progress = 1 - clamp(brain.timer / Math.max(0.001, atk.active), 0, 1);
        brain.sweepAngle = brain.sweepFrom + TAU * progress;
        enemySweepHit(world, enemy, atk);
      }
      if (brain.timer <= 0) {
        brain.phase = 'recover';
        brain.timer = atk.recovery;
      }
      return true;
    }
    brain.timer -= dt;
    return brain.timer > 0;
  }

  brain.idleTimer -= dt;
  enemy.turnRate = 6;
  return brain.idleTimer > 0;
}

function enemySweepHit(world: GameWorld, enemy: Enemy, atk: EnemyAttackDef) {
  const brain = enemy.brain;
  if (brain.sweepHit) return;
  const player = world.player;
  const tipX = enemy.x + Math.cos(brain.sweepAngle) * atk.reach;
  const tipY = enemy.y + Math.sin(brain.sweepAngle) * atk.reach;
  let hitSomething = false;
  if (
    !player.dead &&
    player.invuln <= 0 &&
    segmentCircleHit(
      enemy.x,
      enemy.y,
      tipX,
      tipY,
      player.x,
      player.y,
      player.radius + 9,
    )
  ) {
    playerHit(world, atk.damage);
    hitSomething = true;
  }
  // A taunted sweep bites the turret instead of reaching for the player.
  const turret = turretById(world, brain.turretId);
  if (
    turret &&
    segmentCircleHit(
      enemy.x,
      enemy.y,
      tipX,
      tipY,
      turret.x,
      turret.y,
      TURRET.radius + 9,
    )
  ) {
    damageTurret(world, turret, atk.damage);
    hitSomething = true;
  }
  if (!hitSomething) return;
  brain.sweepHit = true;
  world.shake = Math.max(world.shake, 6);
  spawnBurst(world, tipX, tipY, enemy.color, 8, 150, 0.3);
}

function fireEnemyShot(world: GameWorld, enemy: Enemy, atk: EnemyAttackDef) {
  if (atk.mode === 'shell') {
    fireShell(world, enemy, atk);
    return;
  }
  if (atk.mode === 'homing') {
    fireHoming(world, enemy, atk);
    return;
  }
  const target = enemyAttackPoint(world, enemy);
  const angle =
    Math.atan2(target.y - enemy.y, target.x - enemy.x) + rand(-0.05, 0.05);
  const x = enemy.x + Math.cos(angle) * (enemy.radius + 5);
  const y = enemy.y + Math.sin(angle) * (enemy.radius + 5);
  world.enemyBullets.push({
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(angle) * 300,
    vy: Math.sin(angle) * 300,
    radius: 6.5,
    damage: atk.damage,
    life: 4,
    color: enemy.color,
  });
  spawnBurst(world, x, y, enemy.color, 4, 90, 0.25);
  world.sfx.play('spit');
}

/** Lobs one shell at where its target stands right now. */
function fireShell(world: GameWorld, enemy: Enemy, atk: EnemyAttackDef) {
  const target = enemyAttackPoint(world, enemy);
  const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
  const x = enemy.x + Math.cos(angle) * (enemy.radius + SHELL_RADIUS + 6);
  const y = enemy.y + Math.sin(angle) * (enemy.radius + SHELL_RADIUS + 6);
  const travel = Math.max(1, dist(x, y, target.x, target.y));
  world.shells.push({
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(angle) * SHELL_SPEED,
    vy: Math.sin(angle) * SHELL_SPEED,
    radius: SHELL_RADIUS,
    damage: atk.damage,
    // Fixed aim point: if the target moves, the shell still lands here.
    targetX: target.x,
    targetY: target.y,
    traveled: 0,
    total: travel,
    life: SHELL_FLIGHT_TIME,
    color: enemy.color,
    spin: rand(0, TAU),
  });
  spawnBurst(world, x, y, enemy.color, 6, 110, 0.3);
  world.sfx.play('shell');
}

/**
 * Launches a missile that starts out aimed at the player and then chases at
 * a capped turn rate. The lock only lasts HOMING_SEEK_TIME, after which the
 * missile keeps whatever heading it had and flies straight.
 */
function fireHoming(world: GameWorld, enemy: Enemy, atk: EnemyAttackDef) {
  const target = enemyAttackPoint(world, enemy);
  const angle =
    Math.atan2(target.y - enemy.y, target.x - enemy.x) + rand(-0.1, 0.1);
  const x = enemy.x + Math.cos(angle) * (enemy.radius + 9);
  const y = enemy.y + Math.sin(angle) * (enemy.radius + 9);
  world.homings.push({
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(angle) * HOMING_SPEED,
    vy: Math.sin(angle) * HOMING_SPEED,
    angle,
    radius: HOMING_RADIUS,
    damage: atk.damage,
    seek: HOMING_SEEK_TIME,
    life: HOMING_LIFE,
    color: enemy.color,
    spin: rand(0, TAU),
    trail: [{ x, y }],
    turretId: turretById(world, enemy.brain.turretId)?.id,
  });
  spawnBurst(world, x, y, enemy.color, 5, 100, 0.28);
  world.sfx.play('lock');
}
