import {
  DOOR_HALF,
  DOOR_Y,
  DUNGEON_ROOMS,
  PLAYER_COLOR,
  PORTAL_RADIUS,
  PORTAL_X,
  PORTAL_Y,
  ROOM_SIZE,
  WALL_PAD,
  WALL_THICK,
} from '../core/config';
import { ENEMY_DEFS } from '../core/enemyDefs';
import { TAU, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';
import { countCleared, isDoorOpen } from '../systems/world';
import { WEAPONS } from '../weapons';
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

export function drawRoomLabel(world: GameWorld, room: number, accent: string) {
  if (world.mode === 'boss') return;
  const ctx = world.ctx;
  const title =
    room === 0 ? 'START' : room === DUNGEON_ROOMS - 1 ? 'PORTAL' : `COMBAT 0${room}`;
  const cn = room === 0 ? '起始房' : room === DUNGEON_ROOMS - 1 ? '传送门' : '战斗房';
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

export function drawFloor(world: GameWorld) {
  const ctx = world.ctx;
  const halfW = world.width / (2 * world.zoom);
  const halfH = world.height / (2 * world.zoom);
  const viewLeft = world.camera.x - halfW;
  const viewRight = world.camera.x + halfW;
  const viewTop = world.camera.y - halfH;
  const viewBottom = world.camera.y + halfH;

  // No full-world backfill: the rooms and the wall strips between them cover
  // the world exactly, and repainting the whole dungeon every frame was a
  // wasted screen-sized fill.
  const rooms = world.mode === 'boss' ? 1 : DUNGEON_ROOMS;
  for (let room = 0; room < rooms; room++) {
    const roomLeft = room * ROOM_SIZE;
    const roomRight = roomLeft + ROOM_SIZE;
    if (roomRight < viewLeft - 80 || roomLeft > viewRight + 80) continue;

    const accent = roomAccent(world, room);
    const base = roomBaseColor(world, room);
    const inset = WALL_PAD;

    ctx.fillStyle = base;
    ctx.fillRect(roomLeft + inset, inset, ROOM_SIZE - WALL_THICK, world.worldH - WALL_THICK);

    ctx.save();
    ctx.beginPath();
    ctx.rect(roomLeft + inset, inset, ROOM_SIZE - WALL_THICK, world.worldH - WALL_THICK);
    ctx.clip();

    // Grid: one path per alpha instead of one stroke per line, so a room
    // costs two strokes no matter how many lines are on screen.
    const step = 80;
    ctx.lineWidth = 1 / world.zoom;
    ctx.strokeStyle = withAlpha(accent, 0.04);
    ctx.beginPath();
    for (let x = roomLeft + step; x < roomRight; x += step) {
      if (x < viewLeft - step || x > viewRight + step) continue;
      if ((x - roomLeft) % 400 === 0) continue;
      ctx.moveTo(x, inset);
      ctx.lineTo(x, world.worldH - inset);
    }
    for (let y = step; y < world.worldH - step; y += step) {
      if (y < viewTop - step || y > viewBottom + step) continue;
      if (y % 400 === 0) continue;
      ctx.moveTo(roomLeft + inset, y);
      ctx.lineTo(roomRight - inset, y);
    }
    ctx.stroke();

    ctx.strokeStyle = withAlpha(accent, 0.1);
    ctx.beginPath();
    for (let x = roomLeft + step; x < roomRight; x += step) {
      if (x < viewLeft - step || x > viewRight + step) continue;
      if ((x - roomLeft) % 400 !== 0) continue;
      ctx.moveTo(x, inset);
      ctx.lineTo(x, world.worldH - inset);
    }
    for (let y = step; y < world.worldH - step; y += step) {
      if (y < viewTop - step || y > viewBottom + step) continue;
      if (y % 400 !== 0) continue;
      ctx.moveTo(roomLeft + inset, y);
      ctx.lineTo(roomRight - inset, y);
    }
    ctx.stroke();

    // Faint room number etched into the floor.
    if (world.mode !== 'boss') {
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

    // Faint survey markings
    for (const mark of world.floorMarks) {
      if (
        mark.x + mark.radius < viewLeft ||
        mark.x - mark.radius > viewRight ||
        mark.y + mark.radius < viewTop ||
        mark.y - mark.radius > viewBottom
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

    // Sparse debris / stars. Their per-mote twinkle is quantised into a few
    // alpha buckets so a room costs a handful of fills instead of ~30.
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
        if (decoration.x < viewLeft - 8 || decoration.x > viewRight + 8) continue;
        if (decoration.y < viewTop - 8 || decoration.y > viewBottom + 8) continue;
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

    ctx.restore();
    drawRoomLabel(world, room, accent);
  }

  drawWalls(world);
}

export function drawWallSegment(world: GameWorld, x: number, y: number, w: number, h: number) {
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

export function drawWalls(world: GameWorld) {
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

export function drawDoor(world: GameWorld, boundary: number) {
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

/**
 * Faint ring for the equipped weapon's maximum range. Range-limited weapons
 * (seeker, flamer) draw it; the rest draw nothing.
 */
export function drawWeaponRange(world: GameWorld) {
  const spec = WEAPONS[world.player.weapon];
  if (!spec.range || world.player.dead) return;
  const ctx = world.ctx;
  const player = world.player;
  const breathe = 0.5 + Math.sin(world.ambientTime * 2.2) * 0.5;
  ctx.save();
  ctx.fillStyle = withAlpha(spec.color, 0.025);
  ctx.strokeStyle = withAlpha(spec.color, 0.2 + breathe * 0.08);
  ctx.lineWidth = 2 / world.zoom;
  ctx.setLineDash([12, 14]);
  ctx.lineDashOffset = -world.ambientTime * 16;
  ctx.beginPath();
  ctx.arc(player.x, player.y, spec.range, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Ground layer of the carpet bomber: the call-in corridor and the plane's
 * shadow. The plane itself is drawn above everyone in drawBombers.
 */
export function drawBomberShadows(world: GameWorld) {
  if (!world.bombers.length) return;
  const ctx = world.ctx;
  for (const bomber of world.bombers) {
    const travelled = Math.max(
      0,
      (bomber.elapsed - bomber.callIn) * bomber.speed,
    );
    const x = bomber.startX + bomber.dirX * travelled;
    const y = bomber.startY + bomber.dirY * travelled;

    if (bomber.elapsed < bomber.callIn) {
      // Dashed corridor before the plane arrives, so the run is telegraphed.
      const angle = Math.atan2(bomber.dirY, bomber.dirX);
      ctx.save();
      ctx.strokeStyle = withAlpha(bomber.color, 0.32);
      ctx.lineWidth = 2 / world.zoom;
      ctx.setLineDash([18, 12]);
      ctx.lineDashOffset = -world.ambientTime * 44;
      ctx.beginPath();
      ctx.moveTo(bomber.startX, bomber.startY);
      ctx.lineTo(bomber.endX, bomber.endY);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let d = 150; d < bomber.length; d += 190) {
        const px = bomber.startX + bomber.dirX * d;
        const py = bomber.startY + bomber.dirY * d;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(angle);
        ctx.strokeStyle = withAlpha(bomber.color, 0.5);
        ctx.lineWidth = 2 / world.zoom;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(2, 0);
        ctx.lineTo(-6, 6);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    } else if (travelled <= bomber.length) {
      ctx.save();
      ctx.translate(x + 10, y + 16);
      ctx.rotate(Math.atan2(bomber.dirY, bomber.dirX));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 23, 8, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Burning rings left by airstrike bombs: floor layer, under the enemies. */
export function drawFireRings(world: GameWorld) {
  if (!world.fireRings.length) return;
  const ctx = world.ctx;
  ctx.save();
  // Scorch base in normal blending, then the fire itself additively.
  for (const ring of world.fireRings) {
    const fade = Math.min(1, ring.life / 0.55);
    ctx.fillStyle = `rgba(26, 10, 4, ${0.17 * fade})`;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius * 0.92, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const ring of world.fireRings) {
    const fade = Math.min(1, ring.life / 0.55);
    const pulse = ring.pulse;
    const flicker =
      1 + Math.sin(world.ambientTime * 7 + ring.seed) * 0.035 + pulse * 0.05;
    const radius = ring.radius * flicker;
    const gradient = ctx.createRadialGradient(
      ring.x,
      ring.y,
      radius * 0.2,
      ring.x,
      ring.y,
      radius,
    );
    gradient.addColorStop(0, 'rgba(255, 120, 30, 0)');
    gradient.addColorStop(0.55, 'rgba(255, 90, 20, 0)');
    gradient.addColorStop(
      0.8,
      withAlpha('#ff5a1f', (0.1 + pulse * 0.06) * fade),
    );
    gradient.addColorStop(
      0.93,
      withAlpha('#ffb347', (0.3 + pulse * 0.08) * fade),
    );
    gradient.addColorStop(1, 'rgba(255, 180, 70, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, TAU);
    ctx.fill();

    // Uneven burning rim instead of a perfect circle.
    const steps = 28;
    ctx.strokeStyle = withAlpha('#ffcf6b', (0.55 + pulse * 0.25) * fade);
    ctx.lineWidth = 2 + pulse * 1.4;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * TAU;
      const wobble =
        1 +
        Math.sin(angle * 5 + world.ambientTime * 9 + ring.seed) * 0.035 +
        Math.sin(angle * 9 - world.ambientTime * 6) * 0.018;
      const r = radius * 0.94 * wobble;
      const px = ring.x + Math.cos(angle) * r;
      const py = ring.y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPortal(world: GameWorld) {
  if (world.mode !== 'dungeon') return;
  const ctx = world.ctx;
  const active = countCleared(world) >= DUNGEON_ROOMS - 2;
  const t = world.ambientTime;
  const color = active ? '#c08bff' : '#6b6485';

  ctx.save();
  ctx.translate(PORTAL_X, PORTAL_Y);

  ctx.fillStyle = active ? 'rgba(90, 50, 150, 0.16)' : 'rgba(40, 36, 60, 0.2)';
  ctx.beginPath();
  ctx.arc(0, 0, PORTAL_RADIUS + 26, 0, TAU);
  ctx.fill();

  for (let i = 0; i < 4; i++) {
    const r = 34 + i * 22;
    const spin = t * (active ? 0.8 : 0.16) * (i % 2 === 0 ? 1 : -1) + i;
    ctx.strokeStyle = withAlpha(color, active ? 0.5 - i * 0.09 : 0.18);
    ctx.lineWidth = (i === 0 ? 3 : 1.6) / world.zoom;
    ctx.setLineDash(i === 2 ? [10, 14] : []);
    ctx.beginPath();
    ctx.arc(0, 0, r + Math.sin(t * 1.6 + i) * 2.5, spin, spin + TAU * (0.55 + i * 0.08));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (active) {
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(0, -280, 0, 10);
    beam.addColorStop(0, 'rgba(192, 139, 255, 0)');
    beam.addColorStop(0.65, 'rgba(192, 139, 255, 0.1)');
    beam.addColorStop(1, 'rgba(192, 139, 255, 0.3)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-12, -280);
    ctx.lineTo(12, -280);
    ctx.lineTo(PORTAL_RADIUS, 0);
    ctx.lineTo(-PORTAL_RADIUS, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    const glow = 6 + Math.sin(t * 4) * 1.8;
    ctx.fillStyle = 'rgba(236, 224, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, glow, 0, TAU);
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(160, 150, 190, 0.55)';
    ctx.lineWidth = 2 / world.zoom;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(9, 0);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTelegraphs(world: GameWorld) {
  const ctx = world.ctx;
  for (const telegraph of world.telegraphs) {
    const color = ENEMY_DEFS[telegraph.kind].color;
    const progress = 1 - telegraph.timer / telegraph.duration;
    const pulse = 0.65 + Math.sin(world.ambientTime * 22) * 0.25;
    ctx.save();
    ctx.translate(telegraph.x, telegraph.y);
    ctx.globalAlpha = 0.45 + progress * 0.5;
    ctx.strokeStyle = withAlpha(color, 0.9);
    ctx.lineWidth = 2 / world.zoom;
    ctx.beginPath();
    ctx.arc(0, 0, 34 - progress * 15, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.beginPath();
    ctx.arc(0, 0, 42, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
    ctx.stroke();
    ctx.globalAlpha = 0.1 * pulse;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = withAlpha(color, 0.8);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i * TAU) / 4 + world.ambientTime * 1.5;
      ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
      ctx.lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export function drawPickups(world: GameWorld) {
  const ctx = world.ctx;
  for (const pickup of world.pickups) {
    const bob = Math.sin(pickup.age * 3.2) * 4;
    const pulse = 0.7 + Math.sin(pickup.age * 5) * 0.2;
    ctx.save();
    ctx.translate(pickup.x, pickup.y + bob);
    ctx.globalAlpha = pickup.life < 4 ? 0.45 + Math.sin(pickup.age * 12) * 0.35 : 1;
    ctx.strokeStyle = 'rgba(125, 255, 155, 0.35)';
    ctx.lineWidth = 2 / world.zoom;
    ctx.beginPath();
    ctx.arc(0, 0, 24 * pulse, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(8, 24, 18, 0.95)';
    ctx.strokeStyle = '#7dff9b';
    ctx.lineWidth = 2.5 / world.zoom;
    ctx.beginPath();
    ctx.roundRect(-12, -12, 24, 24, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7dff9b';
    ctx.fillRect(-2.5, -8, 5, 16);
    ctx.fillRect(-8, -2.5, 16, 5);
    ctx.restore();
  }
}
