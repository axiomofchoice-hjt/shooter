/** Player movement, aiming, dodge and trigger dispatch. */

import {
  AUTOAIM_RANGE,
  CARDINAL_DIRS,
  DASH_SPEED,
  DASH_TIME,
  DODGE_COOLDOWN,
  DOOR_HALF,
  DOOR_Y,
  DUNGEON_ROOMS,
  PLAYER_COLOR,
  ROOM_SIZE,
  WALL_PAD,
} from '../core/config';
import type { Enemy, Player } from '../core/entities';
import { angleDelta, clamp, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import { WEAPONS, nextWeapon, previousWeapon } from '../weapons';
import { updateFlamer } from './flamer';
import { spawnBurst } from './fx';
import { clearFunnels, updateFunnels } from './funnels';
import { emitHud } from './hud';
import { readMoveInput } from './input';
import { updateOrbit } from './orbit';
import { updatePartner } from './partner';
import { removeDummy } from './spawn';
import { firePlayerBullet, fireVolleyMissiles } from './weapons';
import {
  clampCamera,
  findNearestEnemy,
  isDoorOpen,
  recycleBoltInFlight,
  resetCameraBias,
  roomBounds,
} from './world';

export function beginDodge(world: GameWorld) {
  if (
    world.phase !== 'playing' ||
    world.paused ||
    world.player.dead ||
    world.dodgeCooldown > 0 ||
    world.player.dashTime > 0
  ) {
    return;
  }

  // Dodge direction only ever follows movement: the auto-aim heading must
  // not pick it, or standing still would fling the player at the nearest
  // enemy. With no input it reuses the last travel direction, which starts
  // out as the ship's initial facing.
  const move = readMoveInput(world);
  const player = world.player;
  if (move.magnitude > 0.12) {
    player.dashDirX = move.x / move.magnitude;
    player.dashDirY = move.y / move.magnitude;
  } else {
    player.dashDirX = player.lastMoveX;
    player.dashDirY = player.lastMoveY;
  }

  player.dashTime = DASH_TIME;
  // i-frames cover the whole slide, which is now longer than the old 0.3s.
  player.invuln = Math.max(player.invuln, DASH_TIME + 0.05);
  player.vx = player.dashDirX * DASH_SPEED;
  player.vy = player.dashDirY * DASH_SPEED;
  world.dashRing.x = player.x;
  world.dashRing.y = player.y;
  world.dashRing.life = world.dashRing.maxLife;
  world.dashFlash = 0.22;
  world.dashTrail.life = 0;
  world.dashGhostTimer = 0;
  world.shake = Math.max(world.shake, 3.5);
  world.sfx.play('dash');
  spawnBurst(
    world,
    player.x - player.dashDirX * 12,
    player.y - player.dashDirY * 12,
    PLAYER_COLOR,
    14,
    210,
    0.4,
  );
  emitHud(world, true);
}

function confinePlayer(world: GameWorld) {
  const player = world.player;
  const bounds = roomBounds(world);
  player.y = clamp(player.y, bounds.top + 24, bounds.bottom - 24);

  if (world.mode === 'boss') {
    player.x = clamp(player.x, bounds.left + 24, bounds.right - 24);
    return;
  }

  const left = bounds.left + player.radius;
  const right = bounds.right - player.radius;
  if (player.x >= left && player.x <= right) return;

  // Allow crossing only through an open doorway, judged at the seam between
  // the current room and its neighbour.
  const movingRight = player.x > right;
  const boundary = movingRight ? world.roomIndex + 1 : world.roomIndex;
  const inDoorway = Math.abs(player.y - DOOR_Y) <= DOOR_HALF - player.radius;
  if (inDoorway && isDoorOpen(world, boundary)) {
    // The room only counts as entered once the hull has fully cleared the
    // doorway and its wall: until then the player is still on the threshold
    // and stays in the previous room. Sealing the doors on entry therefore
    // never shoves anyone through a wall.
    const far = movingRight
      ? boundary * ROOM_SIZE + WALL_PAD + player.radius
      : boundary * ROOM_SIZE - WALL_PAD - player.radius;
    const passed = movingRight ? player.x >= far : player.x <= far;
    if (passed) enterRoom(world, movingRight ? boundary : boundary - 1);
    return;
  }
  player.x = clamp(player.x, left, right);
}

/** Move the run into a neighbouring room and drop what belonged to the old one. */
function enterRoom(world: GameWorld, room: number) {
  const next = clamp(room, 0, DUNGEON_ROOMS - 1);
  if (next === world.roomIndex) return;
  world.roomIndex = next;
  // The dummy belongs to the start room; it is rebuilt on the way back.
  removeDummy(world);
  // Turrets and dropped items belong to the room they were left in.
  world.turrets = [];
  world.lobItems = [];
  // Funnels reform around the player in the new room instead of flying
  // through the wall.
  clearFunnels(world);
  resetCameraBias(world);
  clampCamera(world);
}

// ------------------------------------------------------------------- player
export function updatePlayer(world: GameWorld, dt: number) {
  const player = world.player;
  if (player.dead) return;
  const move = readMoveInput(world);

  world.secondaryCooldown = Math.max(0, world.secondaryCooldown - dt);
  world.dodgeCooldown = Math.max(0, world.dodgeCooldown - dt);
  player.trailTimer -= dt;

  if (player.dashTime > 0) updateDash(world, player, dt);
  else updateWalk(world, player, move);

  // External impulses (contact hits, blasts) are tracked separately from the
  // stick velocity so they can shove the player without reintroducing drift.
  const knockDecay = Math.exp(-7 * dt);
  player.knockX *= knockDecay;
  player.knockY *= knockDecay;
  if (Math.abs(player.knockX) < 0.5) player.knockX = 0;
  if (Math.abs(player.knockY) < 0.5) player.knockY = 0;

  player.x += (player.vx + player.knockX) * dt;
  player.y += (player.vy + player.knockY) * dt;
  confinePlayer(world);

  player.fireCooldown -= dt;
  world.bomberCooldown = Math.max(0, world.bomberCooldown - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.muzzle = Math.max(0, player.muzzle - dt);

  updateAim(world, player, move, dt);
  // Escorts are autonomous: they update even when the trigger is released.
  updateFunnels(world, dt);
  updatePartner(world, dt);
  updateTrigger(world, player, dt);
}

/**
 * The dash locks the launch direction, even if the stick is released mid-slide.
 * The last partial frame is scaled so the slide covers exactly DASH_DISTANCE.
 */
function updateDash(world: GameWorld, player: Player, dt: number) {
  const dashStep = Math.min(dt, player.dashTime);
  player.dashTime = Math.max(0, player.dashTime - dt);
  if (player.dashTime === 0) {
    // The cooldown (and its HUD sweep) only starts once the slide is over,
    // so the button reads as ready during the dash itself.
    world.dodgeCooldown = DODGE_COOLDOWN;
    if (world.dashTrail.life === 0) {
      world.dashTrail.x1 = world.dashRing.x;
      world.dashTrail.y1 = world.dashRing.y;
      world.dashTrail.x2 = player.x;
      world.dashTrail.y2 = player.y;
      world.dashTrail.life = world.dashTrail.maxLife;
    }
  }
  const stepScale = dt > 0 ? dashStep / dt : 0;
  player.vx = player.dashDirX * DASH_SPEED * stepScale;
  player.vy = player.dashDirY * DASH_SPEED * stepScale;
  // The slide is movement too: release the stick mid-dodge and the next
  // dodge still heads where the ship actually travelled.
  player.lastMoveX = player.dashDirX;
  player.lastMoveY = player.dashDirY;
  world.dashGhostTimer -= dt;
  if (world.dashGhostTimer <= 0) {
    world.dashGhostTimer = 0.045;
    world.ghosts.push({
      x: player.x,
      y: player.y,
      angle: player.angle,
      dirX: player.dashDirX,
      dirY: player.dashDirY,
      life: 0.26,
      maxLife: 0.26,
    });
  }
  if (player.trailTimer <= 0) {
    player.trailTimer = 0.018;
    world.particles.push({
      x: player.x + rand(-4, 4),
      y: player.y + rand(-4, 4),
      vx: -player.dashDirX * rand(30, 70) + rand(-10, 10),
      vy: -player.dashDirY * rand(30, 70) + rand(-10, 10),
      life: rand(0.16, 0.3),
      maxLife: 0.3,
      size: rand(2.5, 5),
      color: PLAYER_COLOR,
      drag: 3,
    });
  }
}

function updateWalk(
  world: GameWorld,
  player: Player,
  move: { x: number; y: number; magnitude: number },
) {
  let moveX = move.x;
  let moveY = move.y;
  if (move.magnitude > 1) {
    moveX /= move.magnitude;
    moveY /= move.magnitude;
  }

  // Remember where the player is actually travelling, so a dodge from a
  // standstill can reuse it after the stick is released.
  if (move.magnitude > 0.12) {
    const length = Math.hypot(moveX, moveY);
    player.lastMoveX = moveX / length;
    player.lastMoveY = moveY / length;
  }

  // No inertia: velocity follows the stick exactly, so releasing it stops
  // the character in the same frame instead of sliding on.
  player.vx = moveX * player.speed;
  player.vy = moveY * player.speed;

  if (
    (Math.abs(player.vx) > 60 || Math.abs(player.vy) > 60) &&
    player.trailTimer <= 0
  ) {
    player.trailTimer = 0.055;
    world.particles.push({
      x: player.x - player.vx * 0.03 + rand(-5, 5),
      y: player.y - player.vy * 0.03 + rand(-5, 5),
      vx: -player.vx * 0.08 + rand(-12, 12),
      vy: -player.vy * 0.08 + rand(-12, 12),
      life: rand(0.18, 0.36),
      maxLife: 0.36,
      size: rand(1.5, 3.2),
      color: PLAYER_COLOR,
      drag: 2.5,
    });
  }
}

/** Auto-aim, cardinal snapping and laser charge. */
function updateAim(
  world: GameWorld,
  player: Player,
  move: { x: number; y: number; magnitude: number },
  dt: number,
) {
  // Range-limited weapons only auto-aim at targets they can actually lock.
  // Past that ring there is no reticle and no turn: the shot just goes
  // wherever the player is already facing. The salvage cannon has no range
  // cap, so it locks the nearest enemy anywhere on screen.
  const equipped = WEAPONS[player.weapon];
  const aimRange =
    equipped.range ?? (equipped.recycle ? Infinity : AUTOAIM_RANGE);
  world.autoTarget = findNearestEnemy(world, player.x, player.y, aimRange, true);
  if (equipped.cardinal) {
    // The orthogonal cannon snaps the hull itself to one of the four screen
    // axes, so the ship, its muzzle and the secondary scatter all agree.
    world.cardinalAim = pickCardinalAngle(world, move);
    player.angle = world.cardinalAim;
  } else if (world.autoTarget) {
    player.angle = Math.atan2(world.autoTarget.y - player.y, world.autoTarget.x - player.x);
  } else if (move.magnitude > 0.12) {
    player.angle = Math.atan2(move.y, move.x);
  }

  const laserSpec = equipped.laser;
  if (!laserSpec) {
    world.laserCharge = 0;
    return;
  }
  // The charge ring stays empty until the attack cooldown is over; only
  // the part of this frame after the cooldown ends counts.
  if (player.fireCooldown <= 0) {
    const cooldownBefore = player.fireCooldown + dt;
    const chargeDt = cooldownBefore > 0 ? Math.max(0, -player.fireCooldown) : dt;
    world.laserCharge = Math.min(
      1,
      world.laserCharge + chargeDt / laserSpec.chargeTime,
    );
  }
}

/** Firing, volley release, the orbit spin-up and funnels. */
function updateTrigger(world: GameWorld, player: Player, dt: number) {
  const firing = world.input.fireKey || world.input.touchFire || world.input.padFire;
  const activeWeapon = WEAPONS[player.weapon];
  if (activeWeapon.volley) {
    // A release volley only happens once the hold has actually put the
    // required number of shots downrange; a short tap just resets the count.
    if (world.volleyFiring && !firing) {
      if (world.volleyShots >= activeWeapon.volley.shots) {
        fireVolleyMissiles(world, activeWeapon);
      }
      world.volleyShots = 0;
    }
    world.volleyFiring = firing;
  } else {
    world.volleyShots = 0;
    world.volleyFiring = false;
  }

  if (activeWeapon.orbit) {
    // The orbit guards keep circling after the trigger is released: a press
    // starts a timed spin-up, holding simply keeps refilling it.
    updateOrbit(world, dt, firing, activeWeapon);
    return;
  }

  // Leaving the orbit weapon drops whatever spin-up was left.
  world.orbitActive = 0;
  world.orbitExpand = Math.max(0, world.orbitExpand - dt * 4);
  if (activeWeapon.funnel || activeWeapon.coopFunnel || activeWeapon.partner) {
    // These weapons fight through their drones; the hull itself has no gun.
    world.flameTick = 0;
    return;
  }
  if (!firing) {
    // Let the next held burst start on a fresh tick instead of waiting out
    // the remainder of the last one.
    world.flameTick = 0;
    return;
  }
  if (activeWeapon.flame) {
    updateFlamer(world, dt);
    return;
  }
  if (player.fireCooldown > 0) return;
  // The salvage cannon cannot fire again until its bolt has flown all
  // the way home. `fireCooldown` keeps the minimum interval.
  const waitingForBolt = activeWeapon.recycle && recycleBoltInFlight(world);
  const waitingForBomber = activeWeapon.bomber && world.bomberCooldown > 0;
  if (!waitingForBolt && !waitingForBomber) firePlayerBullet(world);
}

/**
 * Orthogonal cannon aim, in three passes:
 * 1. the axis holding the nearest enemy the shot can actually reach;
 * 2. otherwise the axis closest to the nearest enemy's angle;
 * 3. otherwise the axis closest to the movement direction.
 * The corridor test in pass 1 uses the bullet and enemy radii, so "an enemy
 * in that direction" means "this bullet would hit it", not a loose quadrant.
 */
function pickCardinalAngle(
  world: GameWorld,
  move: { x: number; y: number; magnitude: number },
): number {
  const player = world.player;
  const shotRadius = WEAPONS[player.weapon].radius + 2;
  let bestAxis: number | null = null;
  let bestAlong = Infinity;
  let nearest: Enemy | null = null;
  let nearestDist = Infinity;

  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    const ex = enemy.x - player.x;
    const ey = enemy.y - player.y;
    const distance = ex * ex + ey * ey;
    if (distance < nearestDist) {
      nearestDist = distance;
      nearest = enemy;
    }
    for (const dir of CARDINAL_DIRS) {
      const along = ex * dir.x + ey * dir.y;
      if (along <= 0) continue;
      if (Math.abs(ex * dir.y - ey * dir.x) > enemy.radius + shotRadius) continue;
      if (along < bestAlong) {
        bestAlong = along;
        bestAxis = dir.angle;
      }
    }
  }

  if (bestAxis !== null) return bestAxis;
  if (nearest) {
    return snapToCardinal(
      Math.atan2(nearest.y - player.y, nearest.x - player.x),
    );
  }
  if (move.magnitude > 0.12) {
    return snapToCardinal(Math.atan2(move.y, move.x));
  }
  return snapToCardinal(player.angle);
}

function snapToCardinal(angle: number): number {
  let best = CARDINAL_DIRS[0].angle;
  let bestDelta = Math.PI;
  for (const dir of CARDINAL_DIRS) {
    const delta = Math.abs(angleDelta(angle, dir.angle));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = dir.angle;
    }
  }
  return best;
}

export function switchWeapon(world: GameWorld, direction: 1 | -1 = 1) {
  if (world.phase !== 'playing' || world.paused || world.player.dead) return;
  if (world.weaponPool.length < 2) return;
  const next =
    direction > 0
      ? nextWeapon(world.player.weapon, world.weaponPool)
      : previousWeapon(world.player.weapon, world.weaponPool);
  world.player.weapon = next;
  world.volleyShots = 0;
  world.volleyFiring = false;
  // Drones belong to the gun that launched them; the next frame spawns a
  // fresh pair if the new weapon is the funnel gun.
  clearFunnels(world);
  const spec = WEAPONS[next];
  world.floaters.push({
    x: world.player.x,
    y: world.player.y - 44,
    text: spec.name,
    color: spec.color,
    life: 0.9,
    maxLife: 0.9,
    size: 16,
  });
  spawnBurst(world, world.player.x, world.player.y, spec.color, 10, 120, 0.35);
  world.sfx.play('pickup');
  emitHud(world, true);
}
