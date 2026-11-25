/** Storm darts, lobbed items, bombers and recycler bolts. */

import {
  AUTOAIM_RANGE,
  LOB_ACCEL,
  LOB_INITIAL_SPEED,
  LOB_LATERAL_MAX,
  LOB_LIFE,
  LOB_MAX,
  LOB_MAX_SPEED,
  LOB_RADIUS,
  STORM_PULSE_COUNT,
} from '../core/config';
import type { Bomb, Bomber, FireRing, LobItem, StormDart } from '../core/entities';
import { TAU, clamp, dist, rand, segmentCircleHit } from '../core/math';
import type { GameWorld } from '../core/world';
import type { WeaponSpec } from '../weapons';
import { damageEnemy } from './damage';
import { spawnBurst } from './fx';
import { findNearestEnemy, outOfRoom, roomBounds } from './world';

/**
 * Lightning dart: snapshots the target point now, flies past it, then sits
 * there for the rest of its 5s life and pulses an electric AOE. It never
 * homes and has no contact damage.
 */
export function spawnStormDart(world: GameWorld, weapon: WeaponSpec) {
  const player = world.player;
  const storm = weapon.storm;
  if (!storm) return;
  const target = findNearestEnemy(world,
    player.x,
    player.y,
    AUTOAIM_RANGE,
    true,
  );
  const angle = target
    ? Math.atan2(target.y - player.y, target.x - player.x)
    : player.angle;
  const targetDistance = target
    ? dist(player.x, player.y, target.x, target.y)
    : 320;
  const desiredDistance = targetDistance * (1 + storm.overshootRatio);
  const bounds = roomBounds(world);
  const endX = clamp(
    player.x + Math.cos(angle) * desiredDistance,
    bounds.left + 14,
    bounds.right - 14,
  );
  const endY = clamp(
    player.y + Math.sin(angle) * desiredDistance,
    bounds.top + 14,
    bounds.bottom - 14,
  );
  const totalDistance = Math.max(1, desiredDistance);
  // The first 0.5s decelerates from fast to the glide speed and ends at 90%
  // of the target distance. The remaining 20% (90 -> 110%) is crossed at a
  // constant 10% of the target distance per second, so the five zap points
  // are exactly 0.5s apart.
  const fastTime = storm.fastTime;
  const fastDistance = targetDistance * 0.9;
  const glideSpeed = targetDistance * 0.1;
  const startSpeed = (2 * fastDistance) / fastTime - glideSpeed;
  world.stormDarts.push({
    startX: player.x,
    startY: player.y,
    endX,
    endY,
    x: player.x,
    y: player.y,
    age: 0,
    life: weapon.life,
    totalDistance,
    fastTime,
    fastDistance,
    startSpeed,
    glideSpeed,
    pulseInterval: storm.pulseInterval,
    pulseCount: 0,
    aoeRadius: storm.aoeRadius,
    damage: weapon.damage,
    color: weapon.color,
    dirX: Math.cos(angle),
    dirY: Math.sin(angle),
    seed: rand(0, 100),
  });
}

export function updateStormDarts(world: GameWorld, dt: number) {
  for (let i = world.stormDarts.length - 1; i >= 0; i--) {
    const dart = world.stormDarts[i];
    dart.age += dt;
    // Constant deceleration to the 90% point, then a constant glide. The
    // handoff is velocity-continuous, so the dart is still visibly moving
    // when it vanishes at the end of its life.
    let traveled: number;
    if (dart.age < dart.fastTime) {
      const acceleration =
        (dart.glideSpeed - dart.startSpeed) / dart.fastTime;
      traveled =
        dart.startSpeed * dart.age + 0.5 * acceleration * dart.age * dart.age;
    } else {
      traveled =
        dart.fastDistance + dart.glideSpeed * (dart.age - dart.fastTime);
    }
    const progress = clamp(traveled / dart.totalDistance, 0, 1);
    dart.x = dart.startX + (dart.endX - dart.startX) * progress;
    dart.y = dart.startY + (dart.endY - dart.startY) * progress;

    // Zap exactly at 90%, 95%, 100%, 105% and 110%: the age thresholds and
    // the constant glide speed are chosen so the five zaps are 0.5s apart.
    while (
      dart.pulseCount < STORM_PULSE_COUNT &&
      dart.age >= (dart.pulseCount + 1) * dart.pulseInterval
    ) {
      stormPulse(world, dart);
      dart.pulseCount += 1;
    }

    if (dart.age >= dart.life) {
      spawnBurst(world, dart.x, dart.y, dart.color, 12, 170, 0.4);
      world.stormDarts.splice(i, 1);
    }
  }
}

function stormPulse(world: GameWorld, dart: StormDart) {
  // No expanding blast ring here: the zap itself is the electric arcs and
  // sparks, not a shockwave.
  spawnBurst(world, dart.x, dart.y, dart.color, 7, 120, 0.22);
  world.sfx.play('arc');
  let hitAny = false;
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    if (outOfRoom(world, enemy.x, enemy.y, 0)) continue;
    const distance = dist(dart.x, dart.y, enemy.x, enemy.y);
    if (distance > dart.aoeRadius + enemy.radius) continue;
    hitAny = true;
    damageEnemy(world, enemy, dart.damage, enemy.x, enemy.y, true);
    world.arcs.push({
      nodes: [
        { x: dart.x, y: dart.y },
        { x: enemy.x, y: enemy.y },
      ],
      life: 0.16,
      maxLife: 0.16,
      color: dart.color,
      seed: rand(0, 100),
    });
    spawnBurst(world, enemy.x, enemy.y, dart.color, 4, 120, 0.25);
  }
  if (hitAny) world.shake = Math.max(world.shake, 2);
}

/**
 * Parabola gun hit streak. Every fifth enemy hit (different enemies all
 * count) drops one lobbed item at that hit point.
 */
export function registerDropHit(
  world: GameWorld,
  x: number,
  y: number,
  every: number,
  color: string,
) {
  world.dropHits += 1;
  if (world.dropHits < every) return;
  world.dropHits = 0;
  spawnLobItem(world, x, y, color);
}

/**
 * Lobbed item: launched at exactly LOB_INITIAL_SPEED straight away from the
 * player with a random sideways bend, then pulled back by a fixed acceleration
 * toward the player's position at the hit moment. The actual pickup effect is
 * still being designed.
 */
function spawnLobItem(world: GameWorld, x: number, y: number, color: string) {
  if (world.lobItems.length >= LOB_MAX) return;
  const player = world.player;
  let dx = player.x - x;
  let dy = player.y - y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) {
    const angle = rand(0, TAU);
    dx = Math.cos(angle);
    dy = Math.sin(angle);
  } else {
    dx /= length;
    dy /= length;
  }

  // Perpendicular left/right is (-dy, dx); away from the player is (-dx, -dy).
  // The random lateral component bends the launch direction; normalizing keeps
  // the initial speed fixed at LOB_INITIAL_SPEED instead of growing with it.
  const side = Math.random() < 0.5 ? -1 : 1;
  const lateral = rand(0, LOB_LATERAL_MAX) * side;
  let vx = -dy * lateral - dx * LOB_INITIAL_SPEED;
  let vy = dx * lateral - dy * LOB_INITIAL_SPEED;
  const launchSpeed = Math.hypot(vx, vy);
  vx *= LOB_INITIAL_SPEED / launchSpeed;
  vy *= LOB_INITIAL_SPEED / launchSpeed;

  world.lobItems.push({
    x,
    y,
    prevX: x,
    prevY: y,
    vx,
    vy,
    ax: dx * LOB_ACCEL,
    ay: dy * LOB_ACCEL,
    radius: LOB_RADIUS,
    age: 0,
    life: LOB_LIFE,
    maxLife: LOB_LIFE,
    spin: rand(0, TAU),
    color,
    trail: [{ x, y }],
  });
  spawnBurst(world, x, y, color, 10, 150, 0.35);
}

function collectLobItem(world: GameWorld, item: LobItem) {
  spawnBurst(world, item.x, item.y, item.color, 18, 220, 0.45);
  spawnBurst(world, item.x, item.y, '#fff4cf', 6, 140, 0.3);
  world.shockwaves.push({
    x: item.x,
    y: item.y,
    maxRadius: 30,
    life: 0.28,
    maxLife: 0.28,
    color: item.color,
  });
  world.floaters.push({
    x: world.player.x,
    y: world.player.y - 38,
    text: '拾取',
    color: item.color,
    life: 0.9,
    maxLife: 0.9,
    size: 14,
  });
  world.sfx.play('pickup');
  // TODO: the pickup's special effect is intentionally not implemented yet.
}

export function updateLobItems(world: GameWorld, dt: number) {
  const player = world.player;
  for (let i = world.lobItems.length - 1; i >= 0; i--) {
    const item = world.lobItems[i];
    item.prevX = item.x;
    item.prevY = item.y;
    item.vx += item.ax * dt;
    item.vy += item.ay * dt;
    // Clamp the speed so a long return does not turn into a rocket: the pull
    // keeps accelerating but the item stays at most LOB_MAX_SPEED.
    const speed = Math.hypot(item.vx, item.vy);
    if (speed > LOB_MAX_SPEED) {
      const scale = LOB_MAX_SPEED / speed;
      item.vx *= scale;
      item.vy *= scale;
    }
    item.x += item.vx * dt;
    item.y += item.vy * dt;
    item.age += dt;
    item.life -= dt;
    item.spin += dt * 5;
    item.trail.push({ x: item.x, y: item.y });
    if (item.trail.length > 12) item.trail.shift();

    if (
      !player.dead &&
      segmentCircleHit(
        item.prevX,
        item.prevY,
        item.x,
        item.y,
        player.x,
        player.y,
        player.radius + item.radius + 2,
      )
    ) {
      collectLobItem(world, item);
      world.lobItems.splice(i, 1);
      continue;
    }

    if (item.life <= 0 || outOfRoom(world, item.x, item.y, 60)) {
      world.lobItems.splice(i, 1);
    }
  }
}

/**
 * Carpet bomber: calls a plane down the line from the player to the current
 * lock. The run starts outside the room behind the player and ends outside
 * the far wall, so the whole room is covered. The plane drops a bomb every
 * few ticks; each impact blasts enemies and leaves a burning ring behind.
 */
export function launchBomber(world: GameWorld, weapon: WeaponSpec) {
  const spec = weapon.bomber;
  if (!spec) return;
  const player = world.player;
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  const bounds = roomBounds(world);

  // Distance from the player to the wall in one direction. Starting the run
  // outside the wall makes the plane fly in from off-screen instead of
  // popping into existence in the middle of the room.
  const distanceToWall = (dx: number, dy: number) => {
    let distance = 2400;
    if (Math.abs(dx) > 0.00001) {
      distance = Math.min(
        distance,
        (dx > 0 ? bounds.right - player.x : bounds.left - player.x) / dx,
      );
    }
    if (Math.abs(dy) > 0.00001) {
      distance = Math.min(
        distance,
        (dy > 0 ? bounds.bottom - player.y : bounds.top - player.y) / dy,
      );
    }
    return Math.max(0, distance);
  };

  const forward = distanceToWall(dirX, dirY);
  const backward = distanceToWall(-dirX, -dirY);
  const margin = spec.margin;
  const startX = player.x - dirX * (backward + margin);
  const startY = player.y - dirY * (backward + margin);
  const endX = player.x + dirX * (forward + margin);
  const endY = player.y + dirY * (forward + margin);

  world.bombers.push({
    startX,
    startY,
    endX,
    endY,
    dirX,
    dirY,
    length: backward + forward + margin * 2,
    elapsed: 0,
    callIn: spec.callIn,
    speed: spec.planeSpeed,
    dropTimer: 0,
    seed: rand(0, TAU),
    color: weapon.color,
    spec,
  });
  // Signal flare at the call-in point.
  spawnBurst(world, player.x, player.y, '#ffd166', 12, 160, 0.4);
  world.shake = Math.max(world.shake, 3.4);
}

export function updateBombers(world: GameWorld, dt: number) {
  const bounds = roomBounds(world);

  for (let i = world.bombers.length - 1; i >= 0; i--) {
    const bomber = world.bombers[i];
    bomber.elapsed += dt;
    if (bomber.elapsed < bomber.callIn) continue;
    const travelled = (bomber.elapsed - bomber.callIn) * bomber.speed;
    if (travelled >= bomber.length) {
      world.bombers.splice(i, 1);
      continue;
    }
    const x = bomber.startX + bomber.dirX * travelled;
    const y = bomber.startY + bomber.dirY * travelled;
    // A bomb lands `fuse` seconds after release, so start releasing while
    // the plane is still just outside the wall: the first blast then lands
    // right at the room edge instead of leaving an empty strip behind the
    // plane. The drop timer is held at zero until that point, so the carpet
    // does not start a partial interval late.
    const impactX = x + bomber.dirX * bomber.speed * bomber.spec.fuse;
    const impactY = y + bomber.dirY * bomber.speed * bomber.spec.fuse;
    const releasing =
      impactX >= bounds.left &&
      impactX <= bounds.right &&
      impactY >= bounds.top &&
      impactY <= bounds.bottom;
    if (!releasing) {
      bomber.dropTimer = 0;
      continue;
    }
    bomber.dropTimer -= dt;
    while (bomber.dropTimer <= 0) {
      bomber.dropTimer += bomber.spec.dropInterval;
      dropBomb(world, bomber, x, y);
    }
  }

  for (let i = world.bombs.length - 1; i >= 0; i--) {
    const bomb = world.bombs[i];
    bomb.age += dt;
    if (bomb.age >= bomb.fuse) {
      explodeBomb(world, bomb);
      world.bombs.splice(i, 1);
    }
  }

  for (let i = world.fireRings.length - 1; i >= 0; i--) {
    const ring = world.fireRings[i];
    ring.life -= dt;
    ring.pulse = Math.max(0, ring.pulse - dt * 4);
    if (ring.life <= 0) {
      world.fireRings.splice(i, 1);
      continue;
    }
    ring.tickTimer -= dt;
    while (ring.tickTimer <= 0) {
      ring.tickTimer += ring.tickInterval;
      tickFireRing(world, ring);
    }
    if (Math.random() < dt * 6) {
      const angle = rand(0, TAU);
      const radius = Math.sqrt(Math.random()) * ring.radius * 0.9;
      world.particles.push({
        x: ring.x + Math.cos(angle) * radius,
        y: ring.y + Math.sin(angle) * radius,
        vx: rand(-12, 12),
        vy: rand(-46, -18),
        life: rand(0.25, 0.6),
        maxLife: 0.6,
        size: rand(1.4, 3.2),
        color: Math.random() < 0.4 ? '#ffd166' : ring.color,
        drag: 1.2,
      });
    }
  }
}

/** Drop one bomb from the plane, with a little lateral scatter. */
function dropBomb(world: GameWorld, bomber: Bomber, x: number, y: number) {
  const spec = bomber.spec;
  // Bombs keep the plane's forward speed, so their impact point is slightly
  // ahead of where they were released.
  const lead = bomber.speed * spec.fuse;
  const lateral = rand(-spec.spread, spec.spread);
  const groundX = x + bomber.dirX * lead - bomber.dirY * lateral;
  const groundY = y + bomber.dirY * lead + bomber.dirX * lateral;
  const bounds = roomBounds(world);
  world.bombs.push({
    startX: x,
    startY: y - 22,
    x: clamp(groundX, bounds.left + 12, bounds.right - 12),
    y: clamp(groundY, bounds.top + 12, bounds.bottom - 12),
    age: 0,
    fuse: spec.fuse,
    color: bomber.color,
    spec,
  });
}

function explodeBomb(world: GameWorld, bomb: Bomb) {
  const spec = bomb.spec;
  world.shockwaves.push({
    x: bomb.x,
    y: bomb.y,
    maxRadius: spec.blastRadius * 1.25,
    life: 0.42,
    maxLife: 0.42,
    color: '#ffb35c',
  });
  spawnBurst(world, bomb.x, bomb.y, '#ffb347', 14, 240, 0.55);
  spawnBurst(world, bomb.x, bomb.y, '#fff3cf', 5, 140, 0.32);

  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    if (dist(bomb.x, bomb.y, enemy.x, enemy.y) > spec.blastRadius + enemy.radius) {
      continue;
    }
    damageEnemy(world, enemy, spec.blastDamage, enemy.x, enemy.y);
  }

  world.fireRings.push({
    x: bomb.x,
    y: bomb.y,
    radius: spec.ringRadius,
    life: spec.ringLife,
    maxLife: spec.ringLife,
    // The blast already hit at t=0; the first burn tick comes one interval
    // later so the impact is not counted twice.
    tickTimer: spec.ringTickInterval,
    tickInterval: spec.ringTickInterval,
    tickDamage: spec.ringTickDamage,
    pulse: 1,
    seed: rand(0, TAU),
    color: '#ff8a3d',
  });
  if (world.fireRings.length > 24) world.fireRings.shift();
  world.shake = Math.max(world.shake, 3.2);
  world.sfx.play('bomb');
}

function tickFireRing(world: GameWorld, ring: FireRing) {
  ring.pulse = 1;
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    if (dist(ring.x, ring.y, enemy.x, enemy.y) > ring.radius + enemy.radius) {
      continue;
    }
    // Quiet damage: a burn tick on every enemy in every ring at 2 Hz would
    // drown the mix in hit sounds.
    damageEnemy(world, enemy, ring.tickDamage, enemy.x, enemy.y, true);
  }
}
