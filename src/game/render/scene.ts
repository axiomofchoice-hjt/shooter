/** Floor, walls, doors and room labels. */

import {
  DOOR_HALF,
  DOOR_Y,
  DUNGEON_ROOMS,
  PLAYER_COLOR,
  ROOM_SIZE,
  WALL_PAD,
  WALL_THICK,
} from '../core/config';
import { TAU, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';
import { isDoorOpen } from '../systems/world';
import { glow, roomAccent, roomBaseColor } from './shared';

/**
 * The dark gradient behind the world. The floor covers the view almost all
 * the time, so only the strips that fall outside the world are painted —
 * filling the whole canvas here was the most expensive pass of the frame on
 * high-DPI screens.
 */
export function drawBackdrop(world: GameWorld, width: number, height: number) {
  const ctx = world.ctx;
  const halfW = width / (2 * world.zoom);
  const halfH = height / (2 * world.zoom);
  // Screen shake reveals a few pixels of previously painted frame, so shrink
  // the world rect by the shake before deciding a strip is unnecessary.
  const pad = Math.ceil(world.shake) + 2;
  const viewLeft = world.camera.x - halfW;
  const viewRight = world.camera.x + halfW;
  const viewTop = world.camera.y - halfH;
  const viewBottom = world.camera.y + halfH;
  const leftIn = Math.max(viewLeft, pad);
  const rightIn = Math.min(viewRight, world.worldW - pad);
  const topIn = Math.max(viewTop, pad);
  const bottomIn = Math.min(viewBottom, world.worldH - pad);

  ctx.fillStyle = world.bgGradient ?? '#04070d';
  if (leftIn >= rightIn || topIn >= bottomIn) {
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const leftPx = (leftIn - viewLeft) * world.zoom;
  const rightPx = (rightIn - viewLeft) * world.zoom;
  const topPx = (topIn - viewTop) * world.zoom;
  const bottomPx = (bottomIn - viewTop) * world.zoom;
  if (topPx > 0) ctx.fillRect(0, 0, width, topPx);
  if (bottomPx < height) ctx.fillRect(0, bottomPx, width, height - bottomPx);
  if (leftPx > 0) ctx.fillRect(0, topPx, leftPx, Math.max(0, bottomPx - topPx));
  if (rightPx < width) {
    ctx.fillRect(rightPx, topPx, width - rightPx, Math.max(0, bottomPx - topPx));
  }
}

function roomTitle(room: number) {
  if (room === 0) return 'START';
  if (room === DUNGEON_ROOMS - 1) return 'PORTAL';
  return `COMBAT 0${room}`;
}

function roomTitleCn(room: number) {
  if (room === 0) return '起始房';
  if (room === DUNGEON_ROOMS - 1) return '传送门';
  return '战斗房';
}

function drawRoomLabel(world: GameWorld, room: number, accent: string) {
  if (world.mode === 'boss') return;
  const ctx = world.ctx;
  const title = roomTitle(room);
  const cn = roomTitleCn(room);
  const x = room * ROOM_SIZE + ROOM_SIZE / 2;
  const y = WALL_PAD + 34;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = withAlpha(accent, 0.75);
  ctx.fillText(`${title} · ${cn}`, x, y);
  ctx.strokeStyle = withAlpha(accent, 0.28);
  ctx.lineWidth = 1.2 / world.zoom;
  const line = 92;
  ctx.beginPath();
  ctx.moveTo(x - line, y + 16);
  ctx.lineTo(x - 14, y + 16);
  ctx.moveTo(x + 14, y + 16);
  ctx.lineTo(x + line, y + 16);
  ctx.stroke();
  ctx.restore();
}

interface SceneView {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function viewBounds(world: GameWorld): SceneView {
  const halfW = world.width / (2 * world.zoom);
  const halfH = world.height / (2 * world.zoom);
  return {
    left: world.camera.x - halfW,
    right: world.camera.x + halfW,
    top: world.camera.y - halfH,
    bottom: world.camera.y + halfH,
  };
}

export function drawFloor(world: GameWorld) {
  const view = viewBounds(world);
  // No full-world backfill: the rooms and the wall strips between them cover
  // the world exactly, and repainting the whole dungeon every frame was a
  // wasted screen-sized fill.
  const rooms = world.mode === 'boss' ? 1 : DUNGEON_ROOMS;
  for (let room = 0; room < rooms; room++) {
    const roomLeft = room * ROOM_SIZE;
    const roomRight = roomLeft + ROOM_SIZE;
    if (roomRight < view.left - 80 || roomLeft > view.right + 80) continue;
    drawRoomFloor(world, room, roomLeft, view);
  }
  drawWalls(world);
}

function drawRoomFloor(
  world: GameWorld,
  room: number,
  roomLeft: number,
  view: SceneView,
) {
  const ctx = world.ctx;
  const accent = roomAccent(world, room);
  const base = roomBaseColor(world, room);
  const inset = WALL_PAD;

  ctx.fillStyle = base;
  ctx.fillRect(roomLeft + inset, inset, ROOM_SIZE - WALL_THICK, world.worldH - WALL_THICK);

  ctx.save();
  ctx.beginPath();
  ctx.rect(roomLeft + inset, inset, ROOM_SIZE - WALL_THICK, world.worldH - WALL_THICK);
  ctx.clip();

  drawFloorGrid(world, roomLeft, accent, view, inset);
  drawRoomNumber(world, room, roomLeft, accent);
  drawFloorMarks(world, accent, view);
  drawDebris(world, roomLeft, view, inset);

  ctx.restore();
  drawRoomLabel(world, room, accent);
}

/** Grid: one path per alpha instead of one stroke per line, so a room costs
 * two strokes no matter how many lines are on screen. */
function drawFloorGrid(
  world: GameWorld,
  roomLeft: number,
  accent: string,
  view: SceneView,
  inset: number,
) {
  const ctx = world.ctx;
  const roomRight = roomLeft + ROOM_SIZE;
  const step = 80;

  ctx.lineWidth = 1 / world.zoom;
  ctx.strokeStyle = withAlpha(accent, 0.04);
  ctx.beginPath();
  for (let x = roomLeft + step; x < roomRight; x += step) {
    if (x < view.left - step || x > view.right + step) continue;
    if ((x - roomLeft) % 400 === 0) continue;
    ctx.moveTo(x, inset);
    ctx.lineTo(x, world.worldH - inset);
  }
  for (let y = step; y < world.worldH - step; y += step) {
    if (y < view.top - step || y > view.bottom + step) continue;
    if (y % 400 === 0) continue;
    ctx.moveTo(roomLeft + inset, y);
    ctx.lineTo(roomRight - inset, y);
  }
  ctx.stroke();

  ctx.strokeStyle = withAlpha(accent, 0.1);
  ctx.beginPath();
  for (let x = roomLeft + step; x < roomRight; x += step) {
    if (x < view.left - step || x > view.right + step) continue;
    if ((x - roomLeft) % 400 !== 0) continue;
    ctx.moveTo(x, inset);
    ctx.lineTo(x, world.worldH - inset);
  }
  for (let y = step; y < world.worldH - step; y += step) {
    if (y < view.top - step || y > view.bottom + step) continue;
    if (y % 400 !== 0) continue;
    ctx.moveTo(roomLeft + inset, y);
    ctx.lineTo(roomRight - inset, y);
  }
  ctx.stroke();
}

/** Faint room number etched into the floor. */
function drawRoomNumber(
  world: GameWorld,
  room: number,
  roomLeft: number,
  accent: string,
) {
  if (world.mode === 'boss') return;
  const ctx = world.ctx;
  ctx.globalAlpha = 0.045;
  ctx.fillStyle = accent;
  ctx.font = '900 300px "Arial Narrow", "DIN Condensed", ui-sans-serif, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    String(room).padStart(2, '0'),
    roomLeft + ROOM_SIZE / 2,
    world.worldH / 2 + 8,
  );
  ctx.globalAlpha = 1;
}

function drawFloorMarks(world: GameWorld, accent: string, view: SceneView) {
  const ctx = world.ctx;
  for (const mark of world.floorMarks) {
    if (
      mark.x + mark.radius < view.left ||
      mark.x - mark.radius > view.right ||
      mark.y + mark.radius < view.top ||
      mark.y - mark.radius > view.bottom
    ) {
      continue;
    }
    ctx.save();
    ctx.translate(mark.x, mark.y);
    ctx.rotate(mark.rotation);
    ctx.strokeStyle = withAlpha(accent, mark.alpha);
    ctx.lineWidth = 1.2 / world.zoom;
    if (mark.kind === 'ring') {
      ctx.beginPath();
      ctx.arc(0, 0, mark.radius, 0.15, Math.PI * 1.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, mark.radius * 0.72, Math.PI * 1.2, Math.PI * 2.1);
      ctx.stroke();
    } else if (mark.kind === 'cross') {
      ctx.beginPath();
      ctx.moveTo(-mark.radius, 0);
      ctx.lineTo(mark.radius, 0);
      ctx.moveTo(0, -mark.radius);
      ctx.lineTo(0, mark.radius);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, mark.radius * 0.28, 0, TAU);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -mark.radius);
      ctx.lineTo(mark.radius, 0);
      ctx.lineTo(0, mark.radius);
      ctx.lineTo(-mark.radius, 0);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Sparse debris / stars. Their per-mote twinkle is quantised into a few alpha
 * buckets so a room costs a handful of fills instead of ~30. */
function drawDebris(
  world: GameWorld,
  roomLeft: number,
  view: SceneView,
  inset: number,
) {
  const ctx = world.ctx;
  const roomRight = roomLeft + ROOM_SIZE;
  const bucketStep = 0.045;
  const buckets = 6;
  for (let bucket = 1; bucket <= buckets; bucket++) {
    const alpha = bucket * bucketStep;
    let any = false;
    ctx.beginPath();
    for (const decoration of world.decorations) {
      if (
        decoration.x < roomLeft + inset ||
        decoration.x > roomRight - inset ||
        decoration.y < inset ||
        decoration.y > world.worldH - inset
      ) {
        continue;
      }
      if (decoration.x < view.left - 8 || decoration.x > view.right + 8) continue;
      if (decoration.y < view.top - 8 || decoration.y > view.bottom + 8) continue;
      const twinkle =
        0.55 + Math.sin(world.ambientTime * 0.8 + decoration.phase) * 0.35;
      const value = decoration.alpha * twinkle;
      const index = Math.min(buckets, Math.max(1, Math.round(value / bucketStep)));
      if (index !== bucket) continue;
      const size = decoration.size / world.zoom + 0.7;
      ctx.rect(decoration.x, decoration.y, size, size);
      any = true;
    }
    if (!any) continue;
    ctx.fillStyle = `rgba(126, 213, 232, ${alpha.toFixed(3)})`;
    ctx.fill();
  }
}

function drawWallSegment(world: GameWorld, x: number, y: number, w: number, h: number) {
  if (h <= 0) return;
  const ctx = world.ctx;
  ctx.fillStyle = '#0b141d';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(140, 210, 230, 0.16)';
  ctx.lineWidth = 1 / world.zoom;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(95, 246, 255, 0.07)';
  ctx.beginPath();
  for (let lineY = y + 60; lineY < y + h - 10; lineY += 80) {
    ctx.moveTo(x + 6, lineY);
    ctx.lineTo(x + w - 6, lineY);
  }
  ctx.stroke();
}

function drawWalls(world: GameWorld) {
  const ctx = world.ctx;
  // The four outer strips share one fill.
  ctx.fillStyle = '#0b141d';
  ctx.beginPath();
  ctx.rect(0, 0, world.worldW, WALL_PAD);
  ctx.rect(0, world.worldH - WALL_PAD, world.worldW, WALL_PAD);
  ctx.rect(0, 0, WALL_PAD, world.worldH);
  ctx.rect(world.worldW - WALL_PAD, 0, WALL_PAD, world.worldH);
  ctx.fill();

  ctx.strokeStyle = 'rgba(120, 200, 220, 0.3)';
  ctx.lineWidth = 2 / world.zoom;
  ctx.strokeRect(WALL_PAD, WALL_PAD, world.worldW - WALL_THICK, world.worldH - WALL_THICK);

  if (world.mode === 'dungeon') {
    const doorTop = DOOR_Y - DOOR_HALF;
    const doorBottom = DOOR_Y + DOOR_HALF;
    const halfW = world.width / (2 * world.zoom);
    // Only the dividing walls inside the view are worth drawing; a room is
    // 1000 wide, so most boundaries are off screen.
    for (let boundary = 1; boundary < DUNGEON_ROOMS; boundary++) {
      const x = boundary * ROOM_SIZE;
      if (x < world.camera.x - halfW - 80 || x > world.camera.x + halfW + 80) continue;
      drawWallSegment(world, x - WALL_PAD, WALL_PAD, WALL_THICK, doorTop - WALL_PAD);
      drawWallSegment(world,
        x - WALL_PAD,
        doorBottom,
        WALL_THICK,
        world.worldH - WALL_PAD - doorBottom,
      );
      drawDoor(world, boundary);
    }
  }

  // Corner brackets
  const bracket = 58;
  const corners: Array<[number, number, number, number]> = [
    [WALL_PAD, WALL_PAD, 1, 1],
    [world.worldW - WALL_PAD, WALL_PAD, -1, 1],
    [WALL_PAD, world.worldH - WALL_PAD, 1, -1],
    [world.worldW - WALL_PAD, world.worldH - WALL_PAD, -1, -1],
  ];
  ctx.strokeStyle = 'rgba(95, 246, 255, 0.6)';
  ctx.lineWidth = 4 / world.zoom;
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + bracket * sx, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + bracket * sy);
    ctx.stroke();
  }
}

function drawDoor(world: GameWorld, boundary: number) {
  const ctx = world.ctx;
  const x = boundary * ROOM_SIZE;
  const top = DOOR_Y - DOOR_HALF;
  const bottom = DOOR_Y + DOOR_HALF;
  const open = isDoorOpen(world, boundary);
  const pulse = 0.5 + Math.sin(world.ambientTime * 6.5) * 0.2;

  // The gate sits inside the wall band, which no room fill covers. It needs
  // an opaque base: the field below is translucent and would otherwise stack
  // on top of the previous frame's pixels.
  ctx.fillStyle = '#03060b';
  ctx.fillRect(x - WALL_PAD, top, WALL_THICK, DOOR_HALF * 2);

  // Door posts
  ctx.fillStyle = '#16232f';
  ctx.fillRect(x - WALL_PAD - 7, top - 16, WALL_THICK + 14, 16);
  ctx.fillRect(x - WALL_PAD - 7, bottom, WALL_THICK + 14, 16);

  if (!open) {
    const field = ctx.createLinearGradient(x - WALL_PAD, 0, x + WALL_PAD, 0);
    field.addColorStop(0, 'rgba(255, 77, 125, 0.04)');
    field.addColorStop(0.5, `rgba(255, 77, 125, ${0.18 + pulse * 0.16})`);
    field.addColorStop(1, 'rgba(255, 77, 125, 0.04)');
    ctx.fillStyle = field;
    ctx.fillRect(x - WALL_PAD + 5, top, WALL_THICK - 10, DOOR_HALF * 2);

    ctx.strokeStyle = `rgba(255, 128, 152, ${0.3 * pulse})`;
    ctx.lineWidth = 1.4 / world.zoom;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const y = top + ((world.ambientTime * 46 + i * 44) % (DOOR_HALF * 2));
      ctx.moveTo(x - WALL_PAD + 6, y);
      ctx.lineTo(x + WALL_PAD - 6, y);
    }
    ctx.stroke();

    // Lock glyph in the middle of the field.
    ctx.strokeStyle = `rgba(255, 190, 205, ${0.5 + pulse * 0.2})`;
    ctx.lineWidth = 2 / world.zoom;
    ctx.beginPath();
    ctx.arc(x, DOOR_Y, 13, Math.PI, TAU);
    ctx.stroke();
    ctx.strokeRect(x - 14, DOOR_Y, 28, 20);
  } else {
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.32)';
    ctx.lineWidth = 1.6 / world.zoom;
    ctx.beginPath();
    ctx.moveTo(x - WALL_PAD + 4, top + 4);
    ctx.lineTo(x - WALL_PAD + 4, bottom - 4);
    ctx.moveTo(x + WALL_PAD - 4, top + 4);
    ctx.lineTo(x + WALL_PAD - 4, bottom - 4);
    ctx.stroke();

    ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.5);
    ctx.lineWidth = 2.4 / world.zoom;
    ctx.beginPath();
    ctx.moveTo(x - 10, DOOR_Y - 16);
    ctx.lineTo(x + 8, DOOR_Y);
    ctx.lineTo(x - 10, DOOR_Y + 16);
    ctx.stroke();
  }

  // Lamp on top of the frame: a cached glow instead of a blurred shadow.
  ctx.save();
  ctx.translate(x, top - 28);
  ctx.fillStyle = glow(world, open ? PLAYER_COLOR : '#ff4d7d', 0.75, 16);
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, TAU);
  ctx.fill();
  ctx.fillStyle = open ? PLAYER_COLOR : '#ff4d7d';
  ctx.beginPath();
  ctx.arc(0, 0, 3.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}
