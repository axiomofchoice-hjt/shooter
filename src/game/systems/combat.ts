/** Player bullets and enemy bullets, from steering to impact. */

import type { Bullet, Enemy } from '../core/entities';
import { TAU, angleDelta, clamp, dist, segmentCircleHit } from '../core/math';
import type { GameWorld } from '../core/world';
import { TURRET } from '../weapons';
import { damageEnemy, damageTurret, playerHit } from './damage';
import { spawnBurst } from './fx';
import { registerSummonHit } from './turrets';
import { outOfRoom, roomBounds } from './world';

// ------------------------------------------------------------------ bullets
export function knockbackResistance(enemy: Enemy) {
  if (enemy.kind === 'boss') return 0.15;
  if (enemy.radius >= 22) return 0.55;
  return 1;
}

export function updateBullets(world: GameWorld, dt: number) {
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    if (updateBullet(world, world.bullets[i], dt)) {
      world.bullets.splice(i, 1);
    }
  }
  compactEnemies(world);
}

/** Returns true when the shot leaves the field and must be removed. */
function updateBullet(world: GameWorld, bullet: Bullet, dt: number) {
  bullet.prevX = bullet.x;
  bullet.prevY = bullet.y;

  const missile = bullet.missile;
  const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
  const returning = bullet.recycle === true && bullet.returning === true;
  steerBullet(world, bullet, dt, speed, missile, returning);

  // Bubbles shed speed exponentially: they leave fast, then hang almost
  // still for the rest of their long life instead of stopping abruptly.
  if (bullet.bubble) {
    const decay = Math.exp(-bullet.bubble.drag * dt);
    bullet.vx *= decay;
    bullet.vy *= decay;
  }

  bullet.x += bullet.vx * dt;
  bullet.y += bullet.vy * dt;
  bullet.life -= dt;

  // Homeward leg: nothing hurts it and walls do not stop it, it only has
  // to reach the player. Reaching them is what recycles the shot.
  if (returning) {
    if (!reachedPlayer(world, bullet)) return false;
    spawnBurst(world, world.player.x, world.player.y, bullet.color, 3, 70, 0.16);
    return true;
  }

  let consumed = collideWithEnemies(world, bullet);
  if (consumed && bullet.bubble) {
    // Soap film pops on contact, so a bubble never reads as a solid bullet.
    spawnBurst(world, bullet.x, bullet.y, bullet.color, 4, 80, 0.2);
  }
  if (!consumed) {
    consumed = resolveWallContacts(world, bullet, missile, speed * dt);
  }

  // Reached the spot where its locked target died: pop instead of
  // continuing on to an unrelated enemy. A salvage bolt never does this —
  // losing the lock sends it on to a wall so it can come home.
  if (
    !consumed &&
    missile &&
    missile.dead &&
    !bullet.recycle &&
    dist(bullet.x, bullet.y, missile.x, missile.y) <=
      speed * dt + bullet.radius + 4
  ) {
    consumed = finishMissileAtDeathSpot(world, bullet, missile);
  }

  // A salvage bolt that somehow runs out of outbound time still turns
  // around instead of vanishing.
  if (!consumed && bullet.recycle && !bullet.returning && bullet.life <= 0) {
    bullet.returning = true;
    bullet.life = 2;
  }

  const leaving =
    consumed ||
    bullet.life <= 0 ||
    // Locking missiles are not stopped by room walls, only by their range.
    // Salvage bolts handle their own wall contact above.
    (!missile && !bullet.recycle && outOfRoom(world, bullet.x, bullet.y, 24));
  if (leaving && !consumed && bullet.blast) {
    detonateBlast(world, bullet.x, bullet.y, bullet.blast, bullet.color);
  }
  return leaving;
}

/** Room-edge reactions: recall, shock burst, fission burst and ricochet. */
function resolveWallContacts(
  world: GameWorld,
  bullet: Bullet,
  missile: Bullet['missile'],
  wallMargin: number,
) {
  // A salvage bolt with no live lock is an ordinary projectile: it stops at
  // the room wall, then turns around and comes home.
  if (bullet.recycle && !bullet.returning && (!missile || missile.dead)) {
    turnRecycleBoltAtWall(world, bullet);
  }

  // Concussion shells burst against the room wall instead of leaving.
  if (bullet.shock && burstShockAtWall(world, bullet)) return true;

  // Fission shells burst against the room wall as well. The burst keeps the
  // shell's own heading, so about half of the children fly straight back
  // into the wall and are lost — that is the geometry, not an aim assist.
  if (bullet.split && burstSplitAtWall(world, bullet)) return true;

  // Ricochet shots reflect off the room walls. Each contact spends one
  // bounce; after the last one the shot breaks on the wall instead of
  // passing through it. Clamping into the room keeps the shot alive for
  // the next frame, unlike normal bullets which are dropped once outside.
  // A shot abandoned in the previous room is far past the wall and is left
  // to the regular out-of-room cleanup instead of being snapped over here.
  if (
    bullet.bounce &&
    !outOfRoom(world, bullet.x, bullet.y, wallMargin + 32) &&
    bounceOffWall(world, bullet)
  ) {
    return true;
  }

  return false;
}

function pushTrail(bullet: Bullet) {
  bullet.trail?.push({ x: bullet.x, y: bullet.y });
  if (bullet.trail && bullet.trail.length > 10) bullet.trail.shift();
}

/** Steering, trail and recycle bookkeeping before the shot moves. */
function steerBullet(
  world: GameWorld,
  bullet: Bullet,
  dt: number,
  speed: number,
  missile: Bullet['missile'],
  returning: boolean,
) {
  if (returning) {
    // The salvage bolt is recalled: once it has hit its mark (or a wall)
    // it homes straight back to the player. The next shot waits for this.
    const want = Math.atan2(world.player.y - bullet.y, world.player.x - bullet.x);
    bullet.vx = Math.cos(want) * speed;
    bullet.vy = Math.sin(want) * speed;
    pushTrail(bullet);
    return;
  }

  if (missile) {
    // Refresh the lock point only while the locked target is alive. A dead
    // target leaves the last point (its death spot) in place.
    if (!missile.dead) {
      const target = world.enemies.find(
        (enemy) => enemy.id === missile.targetId && !enemy.dead,
      );
      if (target) {
        missile.x = target.x;
        missile.y = target.y;
      } else {
        missile.dead = true;
      }
    }
    // A salvage bolt that loses its lock keeps its heading and runs into a
    // wall; every other missile flies on to the death spot.
    if (!(bullet.recycle && missile.dead)) {
      const want = Math.atan2(missile.y - bullet.y, missile.x - bullet.x);
      const maxTurn = missile.turnRate * dt;
      missile.angle += clamp(angleDelta(missile.angle, want), -maxTurn, maxTurn);
      bullet.vx = Math.cos(missile.angle) * speed;
      bullet.vy = Math.sin(missile.angle) * speed;
    }
    pushTrail(bullet);
    return;
  }

  // An unguided salvage bolt still draws its trail on the way out.
  if (bullet.recycle) pushTrail(bullet);
}

function reachedPlayer(world: GameWorld, bullet: Bullet) {
  if (bullet.life > 0) {
    const hit = segmentCircleHit(
      bullet.prevX,
      bullet.prevY,
      bullet.x,
      bullet.y,
      world.player.x,
      world.player.y,
      world.player.radius + bullet.radius + 2,
    );
    if (!hit) return false;
  }
  return true;
}

/** Returns true when the shot is spent (consumed by a target). */
function collideWithEnemies(world: GameWorld, bullet: Bullet) {
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    if (
      !segmentCircleHit(
        bullet.prevX,
        bullet.prevY,
        bullet.x,
        bullet.y,
        enemy.x,
        enemy.y,
        enemy.radius + bullet.radius,
      )
    ) {
      continue;
    }
    if (bullet.hitIds.includes(enemy.id)) continue;
    if (enemy.id === bullet.ignoreId) continue;

    if (bullet.shock) {
      detonateShock(world, bullet, enemy.x, enemy.y);
      return true;
    }

    damageEnemy(world, enemy, bullet.damage, bullet.x, bullet.y);
    if (bullet.blast) {
      // The direct target already took the hit; the blast only spreads
      // to the neighbours.
      detonateBlast(world, bullet.x, bullet.y, bullet.blast, bullet.color, enemy.id);
      return true;
    }
    if (bullet.recycle) {
      // The bolt dealt its hit; from now on it is a recall round.
      bullet.returning = true;
      break;
    }
    if (bullet.summonEvery !== undefined) {
      registerSummonHit(world, enemy, bullet.summonEvery, bullet.color);
    }
    if (bullet.split) {
      spawnSplitBullets(world, bullet, enemy.id);
      return true;
    }
    if (bullet.pierce > 0) {
      bullet.pierce -= 1;
      bullet.hitIds.push(enemy.id);
    } else {
      return true;
    }
  }
  return false;
}

function turnRecycleBoltAtWall(world: GameWorld, bullet: Bullet) {
  const bounds = roomBounds(world);
  const r = bullet.radius;
  if (
    bullet.x <= bounds.left + r ||
    bullet.x >= bounds.right - r ||
    bullet.y <= bounds.top + r ||
    bullet.y >= bounds.bottom - r
  ) {
    bullet.x = clamp(bullet.x, bounds.left + r, bounds.right - r);
    bullet.y = clamp(bullet.y, bounds.top + r, bounds.bottom - r);
    bullet.returning = true;
    spawnBurst(world, bullet.x, bullet.y, bullet.color, 4, 90, 0.22);
  }
}

function burstShockAtWall(world: GameWorld, bullet: Bullet) {
  const bounds = roomBounds(world);
  const hitWall =
    bullet.x <= bounds.left + bullet.radius ||
    bullet.x >= bounds.right - bullet.radius ||
    bullet.y <= bounds.top + bullet.radius ||
    bullet.y >= bounds.bottom - bullet.radius;
  if (!hitWall && bullet.life > 0) return false;
  detonateShock(
    world,
    bullet,
    clamp(bullet.x, bounds.left, bounds.right),
    clamp(bullet.y, bounds.top, bounds.bottom),
  );
  return true;
}

function burstSplitAtWall(world: GameWorld, bullet: Bullet) {
  const bounds = roomBounds(world);
  const r = bullet.radius;
  const hitWall =
    bullet.x <= bounds.left + r ||
    bullet.x >= bounds.right - r ||
    bullet.y <= bounds.top + r ||
    bullet.y >= bounds.bottom - r;
  if (!hitWall) return false;
  bullet.x = clamp(bullet.x, bounds.left + r, bounds.right - r);
  bullet.y = clamp(bullet.y, bounds.top + r, bounds.bottom - r);
  spawnSplitBullets(world, bullet);
  return true;
}

function bounceOffWall(world: GameWorld, bullet: Bullet) {
  const bounds = roomBounds(world);
  const r = bullet.radius;
  let hitWall = false;
  if (bullet.x < bounds.left + r) {
    bullet.x = bounds.left + r;
    bullet.vx = Math.abs(bullet.vx);
    hitWall = true;
  } else if (bullet.x > bounds.right - r) {
    bullet.x = bounds.right - r;
    bullet.vx = -Math.abs(bullet.vx);
    hitWall = true;
  }
  if (bullet.y < bounds.top + r) {
    bullet.y = bounds.top + r;
    bullet.vy = Math.abs(bullet.vy);
    hitWall = true;
  } else if (bullet.y > bounds.bottom - r) {
    bullet.y = bounds.bottom - r;
    bullet.vy = -Math.abs(bullet.vy);
    hitWall = true;
  }
  if (!hitWall) return false;
  // A corner hit is still one bounce: both axes flip together.
  if (bullet.bounce && bullet.bounce.left > 0) {
    bullet.bounce.left -= 1;
    spawnBurst(world, bullet.x, bullet.y, bullet.color, 2, 80, 0.18);
    return false;
  }
  return true;
}

function finishMissileAtDeathSpot(
  world: GameWorld,
  bullet: Bullet,
  missile: NonNullable<Bullet['missile']>,
) {
  if (bullet.blast) {
    detonateBlast(world, missile.x, missile.y, bullet.blast, bullet.color);
  } else {
    spawnBurst(world, missile.x, missile.y, bullet.color, 6, 110, 0.3);
  }
  return true;
}

/**
 * Drops dead enemies in place. Rebuilding the array with filter() every frame
 * would allocate a new array (and garbage) at 60Hz for no reason.
 */
export function compactEnemies(world: GameWorld) {
  const enemies = world.enemies;
  let write = 0;
  for (let read = 0; read < enemies.length; read++) {
    const enemy = enemies[read];
    if (enemy.dead) continue;
    enemies[write++] = enemy;
  }
  if (write !== enemies.length) enemies.length = write;
}

/**
 * Small blast carried by a volley missile. `excludeId` is the enemy that
 * took the direct hit, so one missile never damages it twice.
 */
function detonateBlast(
  world: GameWorld,
  x: number,
  y: number,
  blast: { radius: number; damage: number },
  color: string,
  excludeId?: number,
) {
  world.shockwaves.push({
    x,
    y,
    maxRadius: blast.radius * 1.2,
    life: 0.3,
    maxLife: 0.3,
    color,
  });
  world.shake = Math.max(world.shake, 3.2);
  world.sfx.play('blast');
  spawnBurst(world, x, y, color, 14, 220, 0.4);
  spawnBurst(world, x, y, '#ffffff', 6, 140, 0.25);

  for (const enemy of world.enemies) {
    if (enemy.dead || enemy.id === excludeId) continue;
    if (outOfRoom(world, enemy.x, enemy.y, 0)) continue;
    if (dist(x, y, enemy.x, enemy.y) > blast.radius + enemy.radius) continue;
    damageEnemy(world, enemy, blast.damage, enemy.x, enemy.y, true);
    spawnBurst(world, enemy.x, enemy.y, color, 5, 130, 0.25);
  }
}

/**
 * Concussion shell: damages every enemy in the blast and shoves them
 * outward. The player is deliberately untouched — the shockwave only
 * affects enemies.
 */
function detonateShock(world: GameWorld, bullet: Bullet, x: number, y: number) {
  const shock = bullet.shock;
  if (!shock) return;
  world.shockwaves.push({
    x,
    y,
    maxRadius: shock.blastRadius * 1.2,
    life: 0.5,
    maxLife: 0.5,
    color: bullet.color,
  });
  world.shake = Math.max(world.shake, 9);
  world.sfx.play('blast');
  spawnBurst(world, x, y, bullet.color, 26, 330, 0.6);
  spawnBurst(world, x, y, '#ffffff', 12, 220, 0.4);

  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    // Do not reach through a wall into the neighbouring room.
    if (outOfRoom(world, enemy.x, enemy.y, 0)) continue;
    const distance = dist(x, y, enemy.x, enemy.y);
    if (distance > shock.blastRadius + enemy.radius) continue;
    damageEnemy(world, enemy, shock.damage, enemy.x, enemy.y, true);
    const resistance = knockbackResistance(enemy);
    const falloff =
      1 - clamp(distance / (shock.blastRadius + enemy.radius), 0, 1) * 0.55;
    const angle =
      distance > 0.001 ? Math.atan2(enemy.y - y, enemy.x - x) : 0;
    const push = shock.knockback * falloff * resistance;
    enemy.knockX += Math.cos(angle) * push;
    enemy.knockY += Math.sin(angle) * push;
    spawnBurst(world, enemy.x, enemy.y, bullet.color, 4, 130, 0.25);
  }
}

/**
 * Fission burst: ten children evenly around the mother's own heading. The
 * children are ordinary shots that never split again, so one landed shell
 * can only ever produce this single ring.
 */
function spawnSplitBullets(world: GameWorld, bullet: Bullet, ignoreEnemyId?: number) {
  const split = bullet.split;
  if (!split) return;
  const base = Math.atan2(bullet.vy, bullet.vx);
  for (let i = 0; i < split.count; i++) {
    const angle = base + (i / split.count) * TAU;
    world.bullets.push({
      x: bullet.x,
      y: bullet.y,
      prevX: bullet.x,
      prevY: bullet.y,
      vx: Math.cos(angle) * split.speed,
      vy: Math.sin(angle) * split.speed,
      radius: split.radius,
      damage: split.damage,
      life: split.life,
      color: bullet.color,
      pierce: 0,
      hitIds: [],
      ignoreId: ignoreEnemyId,
    });
  }
  spawnBurst(world, bullet.x, bullet.y, bullet.color, 8, 170, 0.3);
  world.shake = Math.max(world.shake, 1.1);
}

export function updateEnemyBullets(world: GameWorld, dt: number) {
  for (let i = world.enemyBullets.length - 1; i >= 0; i--) {
    const bullet = world.enemyBullets[i];
    // Player death clears the bullet array mid-loop.
    if (!bullet) continue;
    bullet.prevX = bullet.x;
    bullet.prevY = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    const player = world.player;
    let hit = false;
    if (
      !player.dead &&
      player.invuln <= 0 &&
      segmentCircleHit(
        bullet.prevX,
        bullet.prevY,
        bullet.x,
        bullet.y,
        player.x,
        player.y,
        player.radius + bullet.radius - 3,
      )
    ) {
      playerHit(world, bullet.damage);
      hit = true;
    }

    // Turrets are valid targets too, whether or not this shot was aimed at
    // one; they are what pulls enemy fire away from the player.
    if (!hit) {
      for (const turret of world.turrets) {
        if (
          segmentCircleHit(
            bullet.prevX,
            bullet.prevY,
            bullet.x,
            bullet.y,
            turret.x,
            turret.y,
            TURRET.radius + bullet.radius - 2,
          )
        ) {
          damageTurret(world, turret, bullet.damage);
          hit = true;
          break;
        }
      }
    }

    if (hit || bullet.life <= 0 || outOfRoom(world, bullet.x, bullet.y, 18)) {
      world.enemyBullets.splice(i, 1);
    }
  }
}
