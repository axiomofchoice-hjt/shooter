/** Enemy shells and homing missiles: flight, impact and explosions. */

import {
  HOMING_BLAST_DAMAGE,
  HOMING_BLAST_RADIUS,
  HOMING_SPEED,
  HOMING_TRAIL_POINTS,
  HOMING_TURN_RATE,
  SHELL_SPEED,
  SPLIT_BULLET_DAMAGE,
  SPLIT_BULLET_LIFE,
  SPLIT_BULLET_SPEED,
  SPLIT_RING_COUNT,
} from '../core/config';
import type { EnemyHoming, EnemyShell, Turret } from '../core/entities';
import { TAU, angleDelta, clamp, dist, rand, segmentCircleHit } from '../core/math';
import type { GameWorld } from '../core/world';
import { TURRET } from '../weapons';
import { damageTurret, playerHit } from './damage';
import { spawnBurst } from './fx';
import { turretById } from './turrets';
import type { RoomBounds } from './world';
import { outOfRoom, roomBounds } from './world';

export function updateShells(world: GameWorld, dt: number) {
  for (let i = world.shells.length - 1; i >= 0; i--) {
    const shell = world.shells[i];
    // Stop exactly on the aim point instead of overshooting it by a frame.
    const step = Math.min(SHELL_SPEED * dt, Math.max(0, shell.total - shell.traveled));
    shell.prevX = shell.x;
    shell.prevY = shell.y;
    const len = Math.hypot(shell.vx, shell.vy) || 1;
    shell.x += (shell.vx / len) * step;
    shell.y += (shell.vy / len) * step;
    shell.traveled += step;
    shell.life -= dt;
    shell.spin += dt * 3.4;

    let burst = false;

    // The only early trigger is touching the player; the shell ignores
    // bullets and only bursts where it was aimed. A dodging player is not
    // there at all, so the shell sails through instead of bursting on them.
    const player = world.player;
    if (
      !player.dead &&
      player.invuln <= 0 &&
      segmentCircleHit(
        shell.prevX,
        shell.prevY,
        shell.x,
        shell.y,
        player.x,
        player.y,
        player.radius + shell.radius - 3,
      )
    ) {
      playerHit(world, shell.damage);
      burst = true;
    }

    if (
      burst ||
      shell.traveled >= shell.total - 0.01 ||
      shell.life <= 0 ||
      outOfRoom(world, shell.x, shell.y, 40)
    ) {
      splitShell(world, shell);
      world.shells.splice(i, 1);
    }
  }
}

/** Bursts a shell into a full ring of fast, unlimited-range bullets. */
function splitShell(world: GameWorld, shell: EnemyShell) {
  const base = rand(0, TAU);
  for (let i = 0; i < SPLIT_RING_COUNT; i++) {
    const angle = base + (TAU * i) / SPLIT_RING_COUNT;
    world.enemyBullets.push({
      x: shell.x,
      y: shell.y,
      prevX: shell.x,
      prevY: shell.y,
      vx: Math.cos(angle) * SPLIT_BULLET_SPEED,
      vy: Math.sin(angle) * SPLIT_BULLET_SPEED,
      radius: 5,
      damage: SPLIT_BULLET_DAMAGE,
      life: SPLIT_BULLET_LIFE,
      color: shell.color,
    });
  }
  spawnBurst(world, shell.x, shell.y, shell.color, 20, 260, 0.5);
  spawnBurst(world, shell.x, shell.y, '#ffffff', 8, 190, 0.32);
  world.shake = Math.max(world.shake, 3);
  world.sfx.play('split');
}

export function updateHomings(world: GameWorld, dt: number) {
  const bounds = roomBounds(world);
  for (let i = world.homings.length - 1; i >= 0; i--) {
    if (updateHoming(world, world.homings[i], bounds, dt)) {
      world.homings.splice(i, 1);
    }
  }
}

/**
 * Small blast that ends a homing missile. A body hit already paid its
 * damage, so only a wall burst can clip the player standing next to it.
 */
function explodeHoming(
  world: GameWorld,
  missile: EnemyHoming,
  alreadyHitPlayer: boolean,
) {
  world.blasts.push({
    x: missile.x,
    y: missile.y,
    radius: HOMING_BLAST_RADIUS,
    life: 0.3,
    maxLife: 0.3,
    color: missile.color,
  });
  spawnBurst(world, missile.x, missile.y, missile.color, 12, 200, 0.36);
  spawnBurst(world, missile.x, missile.y, '#ffffff', 5, 130, 0.22);
  world.shake = Math.max(world.shake, 2.6);
  world.sfx.play('blast');

  const player = world.player;
  if (alreadyHitPlayer || player.dead) return;
  if (
    dist(missile.x, missile.y, player.x, player.y) <=
    HOMING_BLAST_RADIUS + player.radius - 10
  ) {
    if (player.invuln <= 0) playerHit(world, HOMING_BLAST_DAMAGE);
  }
}

/** Returns true when the missile leaves the field and must be removed. */
function updateHoming(
  world: GameWorld,
  missile: EnemyHoming,
  bounds: RoomBounds,
  dt: number,
) {
  missile.prevX = missile.x;
  missile.prevY = missile.y;
  missile.life -= dt;
  missile.spin += dt * 5;
  // Keep the smoke trail short: a curved ribbon, not a full path record.
  missile.trail.push({ x: missile.x, y: missile.y });
  if (missile.trail.length > HOMING_TRAIL_POINTS) missile.trail.shift();

  if (missile.seek > 0) steerHoming(world, missile, dt);

  missile.vx = Math.cos(missile.angle) * HOMING_SPEED;
  missile.vy = Math.sin(missile.angle) * HOMING_SPEED;
  missile.x += missile.vx * dt;
  missile.y += missile.vy * dt;

  // A dodging player is not there: the missile crosses the i-frame gap
  // without detonating, so a well-timed slide really does ignore the shot.
  const hitWall = homingHitWall(missile, bounds);
  const hitPlayer = homingHitPlayer(world, missile);
  const target = turretById(world, missile.turretId);
  const hitTurret = target !== null && homingHitTurret(missile, target);

  if (hitWall || hitPlayer || hitTurret) {
    if (hitPlayer) playerHit(world, missile.damage);
    if (hitTurret && target) damageTurret(world, target, missile.damage);
    explodeHoming(world, missile, hitPlayer);
    return true;
  }

  if (missile.life <= 0) {
    // Out of fuel: no blast, just a fizzle where it gave up.
    spawnBurst(world, missile.x, missile.y, missile.color, 5, 80, 0.3);
    return true;
  }
  return false;
}

/** Chase window: steer toward the taunted turret, or the player. */
function steerHoming(world: GameWorld, missile: EnemyHoming, dt: number) {
  const player = world.player;
  missile.seek = Math.max(0, missile.seek - dt);
  const chaseTurret = turretById(world, missile.turretId);
  if (missile.turretId !== undefined && !chaseTurret) {
    missile.turretId = undefined;
  }
  if (chaseTurret || !player.dead) {
    const tx = chaseTurret ? chaseTurret.x : player.x;
    const ty = chaseTurret ? chaseTurret.y : player.y;
    const want = Math.atan2(ty - missile.y, tx - missile.x);
    const maxTurn = HOMING_TURN_RATE * dt;
    missile.angle += clamp(angleDelta(missile.angle, want), -maxTurn, maxTurn);
  }
  if (missile.seek <= 0) {
    // Lock lost: a white ping marks the moment it stops chasing.
    spawnBurst(world, missile.x, missile.y, '#ffffff', 6, 90, 0.26);
  }
}

function homingHitWall(
  missile: EnemyHoming,
  bounds: RoomBounds,
) {
  // Walls are the room's inner face; the missile's own radius decides how
  // close it has to get before it counts as a touch.
  return (
    missile.x <= bounds.left + missile.radius ||
    missile.x >= bounds.right - missile.radius ||
    missile.y <= bounds.top + missile.radius ||
    missile.y >= bounds.bottom - missile.radius
  );
}

function homingHitPlayer(world: GameWorld, missile: EnemyHoming) {
  const player = world.player;
  if (player.dead || player.invuln > 0) return false;
  return segmentCircleHit(
    missile.prevX,
    missile.prevY,
    missile.x,
    missile.y,
    player.x,
    player.y,
    player.radius + missile.radius - 2,
  );
}

function homingHitTurret(missile: EnemyHoming, turret: Turret) {
  return segmentCircleHit(
    missile.prevX,
    missile.prevY,
    missile.x,
    missile.y,
    turret.x,
    turret.y,
    TURRET.radius + missile.radius - 2,
  );
}
