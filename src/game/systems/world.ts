/** Camera, room geometry, decorations and targeting helpers. */

import {
  CAMERA,
  DUNGEON_ROOMS,
  ROOM_SIZE,
  VIEW_MAX_ZOOM,
  VIEW_MIN_ZOOM,
  VIEW_WORLD_H,
  WALL_PAD,
} from '../core/config';
import type { Enemy, FloorMark } from '../core/entities';
import { TAU, clamp, dist, rand } from '../core/math';
import type { GameWorld } from '../core/world';

export function resetCameraBias(world: GameWorld) {
  world.cameraBiasX = 0;
  world.cameraBiasY = 0;
  world.cameraLeadX = 0;
  world.cameraLeadY = 0;
}

export function updateCamera(world: GameWorld, dt: number) {
  const player = world.player;
  const stepDt = Math.min(dt, 0.05);

  // Look ahead in the movement direction. The lead grows with speed up to a
  // cap, and is itself eased so a direction change does not snap the frame.
  const speed = Math.hypot(player.vx, player.vy);
  let desiredLeadX = 0;
  let desiredLeadY = 0;
  if (speed > 1) {
    const lead = Math.min(CAMERA.maxLead, speed * CAMERA.leadTime);
    desiredLeadX = (player.vx / speed) * lead;
    desiredLeadY = (player.vy / speed) * lead;
  }
  const leadK = 1 - Math.exp(-CAMERA.leadRate * stepDt);
  world.cameraLeadX += (desiredLeadX - world.cameraLeadX) * leadK;
  world.cameraLeadY += (desiredLeadY - world.cameraLeadY) * leadK;

  let targetX = player.x + world.cameraLeadX;
  let targetY = player.y + world.cameraLeadY;

  if (world.mode === 'boss' && world.boss && !world.boss.dead) {
    targetX += (world.boss.x - targetX) * 0.28;
    targetY += (world.boss.y - targetY) * 0.28;
  } else {
    // Weighted average of nearby enemy offsets. The desired offset is kept
    // separate from a persistent bias and eased into it, so an enemy death
    // only starts a slow drift instead of a sudden retarget.
    let sumX = 0;
    let sumY = 0;
    let weight = 0;
    for (const enemy of world.enemies) {
      if (enemy.dead) continue;
      const d = dist(player.x, player.y, enemy.x, enemy.y);
      if (d > CAMERA.enemyRange) continue;
      const w = 1 - d / CAMERA.enemyRange;
      sumX += (enemy.x - player.x) * w * w;
      sumY += (enemy.y - player.y) * w * w;
      weight += w * w;
    }

    let desiredX = 0;
    let desiredY = 0;
    if (weight > 0) {
      desiredX = (sumX / weight) * CAMERA.enemyBias;
      desiredY = (sumY / weight) * CAMERA.enemyBias;
      const offset = Math.hypot(desiredX, desiredY);
      if (offset > CAMERA.maxOffset) {
        const scale = CAMERA.maxOffset / offset;
        desiredX *= scale;
        desiredY *= scale;
      }
    }

    const bk = 1 - Math.exp(-CAMERA.biasRate * stepDt);
    world.cameraBiasX += (desiredX - world.cameraBiasX) * bk;
    world.cameraBiasY += (desiredY - world.cameraBiasY) * bk;
    targetX += world.cameraBiasX;
    targetY += world.cameraBiasY;
  }

  // Ease toward the target plus the player's own step. The feed-forward term
  // cancels the first-order lag, so the camera actually sits at the look-ahead
  // point instead of trailing behind the player and cancelling the lead out.
  // Step time is capped only so a long frame cannot turn the follow into a
  // teleport.
  const k = 1 - Math.exp(-CAMERA.followRate * stepDt);
  world.camera.x +=
    (targetX - world.camera.x) * k + player.vx * stepDt;
  world.camera.y +=
    (targetY - world.camera.y) * k + player.vy * stepDt;
  clampCamera(world);
}

export function updateZoom(world: GameWorld) {
  const maxZoom = world.mode === 'boss' ? 1.08 : VIEW_MAX_ZOOM;
  // Height sets the scale (same slice of world everywhere), the width term
  // keeps the whole room on screen on narrower viewports.
  world.zoom = clamp(
    Math.min(world.height / VIEW_WORLD_H, world.width / ROOM_SIZE),
    VIEW_MIN_ZOOM,
    maxZoom,
  );
  clampCamera(world);
}

function roomLeft(index: number) {
  return index * ROOM_SIZE;
}

export function clampCamera(world: GameWorld) {
  // Keep the camera near the dungeon, but do not stop at the outer wall: the
  // player can see the void beyond the start room's left edge. The generous
  // pad is only a runaway guard, not a framing limit.
  world.camera.x = clamp(
    world.camera.x,
    -CAMERA.outsidePad,
    world.worldW + CAMERA.outsidePad,
  );
  world.camera.y = clamp(
    world.camera.y,
    -CAMERA.outsidePad,
    world.worldH + CAMERA.outsidePad,
  );
}

export function countCleared(world: GameWorld) {
  let cleared = 0;
  for (let room = 1; room <= DUNGEON_ROOMS - 2; room++) {
    if (world.roomCleared[room]) cleared += 1;
  }
  return cleared;
}

export function isDoorOpen(world: GameWorld, boundary: number) {
  if (boundary <= 0 || boundary >= DUNGEON_ROOMS) return false;
  // Combat rooms seal both doors until the encounter is cleared.
  if (world.encounterActive) return false;
  if (boundary === 1) return true;
  return world.roomCleared[boundary - 1];
}

export interface RoomBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function roomBounds(world: GameWorld): RoomBounds {
  const left = roomLeft(world.roomIndex);
  return {
    left: left + WALL_PAD,
    right: left + ROOM_SIZE - WALL_PAD,
    top: WALL_PAD,
    bottom: world.worldH - WALL_PAD,
  };
}

export function outOfRoom(world: GameWorld, x: number, y: number, pad: number) {
  const bounds = roomBounds(world);
  return (
    x < bounds.left - pad ||
    x > bounds.right + pad ||
    y < bounds.top - pad ||
    y > bounds.bottom + pad
  );
}

/** True while a salvage bolt is still flying; only one can be out at a time. */
export function recycleBoltInFlight(world: GameWorld) {
  for (const bullet of world.bullets) {
    if (bullet.recycle) return true;
  }
  return false;
}

export function findNearestEnemy(
  world: GameWorld,
  x: number,
  y: number,
  maxDistance: number,
  visibleOnly = false,
): Enemy | null {
  let nearest: Enemy | null = null;
  let nearestDist = maxDistance;
  // Visibility for targeting is centred on the actor (player or turret), not
  // the camera: moving the camera ahead must not change what can be locked.
  const viewHalfW = world.width / (2 * world.zoom) + 30;
  const viewHalfH = world.height / (2 * world.zoom) + 30;
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    if (
      visibleOnly &&
      (Math.abs(enemy.x - x) > viewHalfW ||
        Math.abs(enemy.y - y) > viewHalfH)
    ) {
      continue;
    }
    const d = dist(x, y, enemy.x, enemy.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = enemy;
    }
  }
  return nearest;
}

export function resize(world: GameWorld) {
  const rect = world.canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (
    Math.abs(world.width - width) < 0.5 &&
    Math.abs(world.height - height) < 0.5 &&
    world.dpr === dpr
  ) {
    return;
  }
  world.width = width;
  world.height = height;
  world.dpr = dpr;
  world.canvas.width = Math.round(width * dpr);
  world.canvas.height = Math.round(height * dpr);
  updateZoom(world);

  const bg = world.ctx.createRadialGradient(
    width * 0.5,
    height * 0.44,
    0,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.78,
  );
  bg.addColorStop(0, '#0a1626');
  bg.addColorStop(0.55, '#060c16');
  bg.addColorStop(1, '#03060b');
  world.bgGradient = bg;

  const danger = world.ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    Math.min(width, height) * 0.32,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.72,
  );
  danger.addColorStop(0, 'rgba(255, 20, 60, 0)');
  danger.addColorStop(1, 'rgba(255, 20, 60, 1)');
  world.dangerGlow = danger;
}

export function buildDecorations(world: GameWorld) {
  world.decorations = [];
  const debris = world.mode === 'boss' ? 90 : 160;
  for (let i = 0; i < debris; i++) {
    world.decorations.push({
      x: rand(70, world.worldW - 70),
      y: rand(70, world.worldH - 70),
      size: rand(1, 3.4),
      alpha: rand(0.06, 0.28),
      phase: rand(0, TAU),
    });
  }

  world.floorMarks = [];
  const kinds: FloorMark['kind'][] = ['ring', 'cross', 'diamond'];
  const rooms = world.mode === 'boss' ? 1 : DUNGEON_ROOMS;
  for (let room = 0; room < rooms; room++) {
    for (let i = 0; i < 9; i++) {
      world.floorMarks.push({
        x: room * ROOM_SIZE + rand(120, ROOM_SIZE - 120),
        y: rand(120, world.worldH - 120),
        radius: rand(28, 120),
        rotation: rand(0, TAU),
        alpha: rand(0.025, 0.075),
        kind: kinds[i % kinds.length],
      });
    }
  }

  world.motes = [];
  for (let i = 0; i < 26; i++) {
    world.motes.push({
      x: Math.random(),
      y: Math.random(),
      size: rand(0.7, 2.1),
      drift: rand(1.5, 8),
      phase: rand(0, TAU),
      color: i % 7 === 0 ? '#ff7d9e' : '#8feaff',
    });
  }
}
