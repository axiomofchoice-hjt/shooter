import { TAU, clamp, rand, withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';
import { recycleBoltInFlight } from '../systems/world';
import { WEAPONS } from '../weapons';

/**
 * Readiness ring for the salvage cannon: dashed while its bolt is still out
 * or flying home (or the interval floor is ticking), solid once the next
 * shot is ready.
 */
export function drawRecycleStatus(world: GameWorld) {
  const spec = WEAPONS[world.player.weapon];
  if (!spec.recycle || world.player.dead) return;
  const waiting = world.player.fireCooldown > 0 || recycleBoltInFlight(world);
  const ctx = world.ctx;
  ctx.save();
  ctx.translate(world.player.x, world.player.y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(spec.color, waiting ? 0.22 : 0.45);
  ctx.lineWidth = waiting ? 1.3 : 1.8;
  if (waiting) {
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -world.ambientTime * 26;
  }
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Falling bombs and the plane itself, above the battlefield. */
export function drawBombers(world: GameWorld) {
  if (!world.bombers.length && !world.bombs.length) return;
  const ctx = world.ctx;

  for (const bomb of world.bombs) {
    const t = clamp(bomb.age / Math.max(0.001, bomb.fuse), 0, 1);
    const x = bomb.startX + (bomb.x - bomb.startX) * t;
    const y = bomb.startY + (bomb.y - bomb.startY) * t;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(bomb.x, bomb.y, 4, 2.2, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha('#ffd166', 0.8);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, 5 + t * 4, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  for (const bomber of world.bombers) {
    if (bomber.elapsed < bomber.callIn) continue;
    const travelled = (bomber.elapsed - bomber.callIn) * bomber.speed;
    if (travelled > bomber.length) continue;
    const x = bomber.startX + bomber.dirX * travelled;
    const y = bomber.startY + bomber.dirY * travelled;
    const angle = Math.atan2(bomber.dirY, bomber.dirX);
    const bob = Math.sin(world.ambientTime * 7 + bomber.seed) * 1.6;

    ctx.save();
    ctx.translate(x, y - 22 + bob);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';
    const exhaust = ctx.createLinearGradient(-58, 0, -16, 0);
    exhaust.addColorStop(0, 'rgba(255, 159, 28, 0)');
    exhaust.addColorStop(1, withAlpha(bomber.color, 0.3));
    ctx.fillStyle = exhaust;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-18, side * 10 - 2);
      ctx.lineTo(
        -58,
        side * 10 + Math.sin(world.ambientTime * 20 + bomber.seed) * 2,
      );
      ctx.lineTo(-18, side * 10 + 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = '#252a36';
    ctx.strokeStyle = withAlpha(bomber.color, 0.9);
    ctx.lineWidth = 1.4;
    // Swept wings.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(8, side * 4);
      ctx.lineTo(-18, side * 30);
      ctx.lineTo(-28, side * 30);
      ctx.lineTo(-12, side * 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Tail fins.
    ctx.fillStyle = '#2e3441';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-22, side * 4);
      ctx.lineTo(-34, side * 14);
      ctx.lineTo(-38, side * 13);
      ctx.lineTo(-28, side * 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Fuselage.
    ctx.fillStyle = '#343b4a';
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(12, -7);
    ctx.lineTo(-22, -6);
    ctx.lineTo(-30, 0);
    ctx.lineTo(-22, 6);
    ctx.lineTo(12, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit and engine lights.
    ctx.fillStyle = '#bfe8ff';
    ctx.beginPath();
    ctx.ellipse(15, 0, 7, 3.2, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (const side of [-1, 1]) {
      ctx.fillStyle = withAlpha(bomber.color, 0.9);
      ctx.beginPath();
      ctx.arc(-19, side * 12, 2.6, 0, TAU);
      ctx.fill();
    }
    if (Math.sin(world.ambientTime * 9 + bomber.seed) > 0.2) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-30, 0, 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * Bomber recharge ring. Unlike the recycler's dashed/solid ring this is a
 * progress arc: the call-in has a long cooldown, so the player needs to see
 * how much of the 6.5s is left even after switching guns and coming back.
 */
export function drawBomberStatus(world: GameWorld) {
  const spec = WEAPONS[world.player.weapon];
  if (!spec.bomber || world.player.dead) return;
  const remaining = clamp(world.bomberCooldown, 0, spec.cooldown);
  const progress = 1 - remaining / spec.cooldown;
  const ctx = world.ctx;
  ctx.save();
  ctx.translate(world.player.x, world.player.y);
  ctx.globalCompositeOperation = 'lighter';

  ctx.strokeStyle = withAlpha(spec.color, 0.16);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, TAU);
  ctx.stroke();

  if (remaining <= 0) {
    const breathe = 0.5 + Math.sin(world.ambientTime * 3) * 0.5;
    ctx.strokeStyle = withAlpha(spec.color, 0.4 + breathe * 0.15);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, TAU);
    ctx.stroke();
  } else {
    ctx.strokeStyle = withAlpha(spec.color, 0.62);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
    ctx.stroke();
  }
  ctx.restore();
}

/** Parabola-gun items: curved trail, glowing core and a dashed target ring. */
export function drawLobItems(world: GameWorld) {
  if (!world.lobItems.length) return;
  const ctx = world.ctx;
  for (const item of world.lobItems) {
    const fadeIn = Math.min(1, item.age / 0.15);
    const fadeOut = Math.min(1, item.life / 0.9);
    const alpha = fadeIn * fadeOut;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 1; i < item.trail.length; i++) {
      const a = item.trail[i - 1];
      const b = item.trail[i];
      const t = i / item.trail.length;
      ctx.strokeStyle = withAlpha(item.color, t * 0.4 * alpha);
      ctx.lineWidth = 1 + t * 3.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(
      item.x,
      item.y,
      1,
      item.x,
      item.y,
      item.radius * 4,
    );
    glow.addColorStop(0, withAlpha(item.color, 0.55 * alpha));
    glow.addColorStop(1, withAlpha(item.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius * 4, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.spin);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = withAlpha(item.color, 0.85);
    ctx.strokeStyle = '#fff6d8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -item.radius);
    ctx.lineTo(item.radius * 0.8, 0);
    ctx.lineTo(0, item.radius);
    ctx.lineTo(-item.radius * 0.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = withAlpha(item.color, 0.35 * alpha);
    ctx.lineWidth = 1.1;
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -world.ambientTime * 18;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius + 7, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/** Glowing damage cone while the flamer is being held. */
export function drawFlamer(world: GameWorld) {
  const player = world.player;
  const spec = WEAPONS[player.weapon];
  if (!spec.flame || player.dead || player.muzzle <= 0) return;
  const range = spec.range ?? 240;
  const half = spec.cone ?? 0.4;
  const ctx = world.ctx;
  const time = world.ambientTime;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const conePath = (spread: number, length: number, wobbleScale: number) => {
    const steps = 14;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    for (let i = 0; i <= steps; i++) {
      const angle = player.angle - spread + (i / steps) * spread * 2;
      const wobble =
        1 +
        Math.sin(time * 24 + i * 1.9) * 0.03 * wobbleScale +
        Math.sin(time * 43 + i * 0.7) * 0.015 * wobbleScale;
      const radius = length * wobble;
      ctx.lineTo(
        player.x + Math.cos(angle) * radius,
        player.y + Math.sin(angle) * radius,
      );
    }
    ctx.closePath();
  };

  const gradient = ctx.createRadialGradient(
    player.x,
    player.y,
    8,
    player.x,
    player.y,
    range,
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.46)');
  gradient.addColorStop(0.15, 'rgba(255, 238, 185, 0.28)');
  gradient.addColorStop(0.5, 'rgba(255, 160, 75, 0.17)');
  gradient.addColorStop(0.85, 'rgba(255, 90, 30, 0.06)');
  gradient.addColorStop(1, 'rgba(255, 60, 20, 0)');
  conePath(half, range, 1);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Overlapping flame tongues give the cone moving texture instead of a
  // flat spotlight wedge.
  for (let i = 0; i < 8; i++) {
    const lane = i / 7 - 0.5;
    const angle =
      player.angle +
      lane * half * 1.7 +
      Math.sin(time * 6 + i * 1.7) * 0.025;
    const length =
      range *
      (0.5 + 0.42 * (0.5 + 0.5 * Math.sin(time * 9 + i * 2.1))) *
      (1 - Math.abs(lane) * 0.35);
    const halfWidth = 7 + Math.sin(time * 15 + i) * 3;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(angle);
    const tongue = ctx.createLinearGradient(0, 0, length, 0);
    tongue.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
    tongue.addColorStop(0.35, 'rgba(255, 210, 120, 0.22)');
    tongue.addColorStop(0.75, 'rgba(255, 120, 40, 0.12)');
    tongue.addColorStop(1, 'rgba(255, 60, 20, 0)');
    ctx.fillStyle = tongue;
    ctx.beginPath();
    ctx.moveTo(16, -halfWidth);
    ctx.quadraticCurveTo(
      length * 0.45,
      -halfWidth * 2.2 + Math.sin(time * 13 + i) * 6,
      length,
      0,
    );
    ctx.quadraticCurveTo(
      length * 0.45,
      halfWidth * 2.2 + Math.sin(time * 11 + i) * 6,
      16,
      halfWidth,
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Hotter inner tongue keeps the middle of the fan brighter.
  const inner = ctx.createRadialGradient(
    player.x,
    player.y,
    4,
    player.x,
    player.y,
    range * 0.7,
  );
  inner.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
  inner.addColorStop(0.45, 'rgba(255, 232, 170, 0.14)');
  inner.addColorStop(1, 'rgba(255, 170, 90, 0)');
  conePath(half * 0.45, range * 0.72, 1.5);
  ctx.fillStyle = inner;
  ctx.fill();
  ctx.restore();
}

/** Piercing laser flashes: soft glow, colored core and white hot center. */
export function drawLaserBeams(world: GameWorld) {
  if (!world.laserBeams.length) return;
  const ctx = world.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const beam of world.laserBeams) {
    const alpha = Math.pow(clamp(beam.life / beam.maxLife, 0, 1), 0.65);
    const strokes: Array<[number, string]> = [
      [beam.width * 3.4, withAlpha(beam.color, 0.14 * alpha)],
      [beam.width, withAlpha(beam.color, 0.65 * alpha)],
      [Math.max(1, beam.width * 0.32), `rgba(255, 255, 255, ${0.8 * alpha})`],
    ];
    for (const [lineWidth, strokeStyle] of strokes) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
    }
    ctx.fillStyle = withAlpha(beam.color, 0.22 * alpha);
    ctx.beginPath();
    ctx.arc(beam.x1, beam.y1, beam.width * 2.2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(beam.x2, beam.y2, beam.width * 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Crackling lightning bolts for the arc weapon. */
export function drawArcs(world: GameWorld) {
  if (!world.arcs.length) return;
  const ctx = world.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const arc of world.arcs) {
    const alpha = clamp(arc.life / arc.maxLife, 0, 1);
    const points = world.arcPoints;
    points.length = 0;
    for (let i = 0; i < arc.nodes.length - 1; i++) {
      const a = arc.nodes[i];
      const b = arc.nodes[i + 1];
      points.push(a.x, a.y);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const steps = 4;
      for (let step = 1; step < steps; step++) {
        const t = step / steps;
        const jitter =
          Math.sin(arc.seed + i * 7.3 + step * 3.1 + world.ambientTime * 55) * 9 +
          rand(-4, 4);
        points.push(a.x + dx * t + nx * jitter, a.y + dy * t + ny * jitter);
      }
      points.push(b.x, b.y);
    }

    // Build the bolt once, then stroke it three times. Folding the fade into
    // globalAlpha also keeps the alpha cache from filling up with one entry
    // per frame, since the life-based alpha changes on every draw.
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);

    ctx.strokeStyle = arc.color;
    ctx.globalAlpha = 0.22 * alpha;
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.globalAlpha = 0.85 * alpha;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.9 * alpha;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The first zap of a run is the first wide, round-joined polyline the canvas
 * has to stroke, and the rasterizer pays its one-off setup for that stroke on
 * whichever frame it shows up — which is why the arc cannon used to hitch the
 * first time it fired. Stroke one almost invisible bolt while the room is
 * still loading, so the setup cost lands behind the scene change instead of
 * on a shot. The bolt is 0.4% opaque and the next frame repaints the floor
 * over it.
 */
export function warmArcStroke(world: GameWorld) {
  const ctx = world.ctx;
  const { x, y } = world.player;
  ctx.save();
  ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
  ctx.translate(world.width / 2, world.height / 2);
  ctx.scale(world.zoom, world.zoom);
  ctx.translate(-world.camera.x, -world.camera.y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = WEAPONS.arc.color;
  ctx.globalAlpha = 0.004;
  // Same shape as a real bolt: a long, sharply angled polyline, so the
  // stroke tessellator builds the same kind of geometry it will need later.
  ctx.beginPath();
  ctx.moveTo(x - 240, y);
  for (let i = 1; i <= 24; i++) {
    ctx.lineTo(x - 240 + i * 20, y + (i % 2 ? 11 : -11));
  }
  for (const width of [10, 3, 1.1]) {
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.restore();
}

/** Charge level shown as a glow at the laser's firing port. */
export function drawLaserMuzzleGlow(world: GameWorld) {
  const player = world.player;
  if (player.weapon !== 'laser' || player.dead) return;
  const charge = clamp(world.laserCharge, 0, 1);
  const color = WEAPONS.laser.color;
  const mx = player.x + Math.cos(player.angle) * 26;
  const my = player.y + Math.sin(player.angle) * 26;
  const pulse =
    charge >= 0.999 ? 0.5 + 0.5 * Math.sin(world.ambientTime * 10) : 0;
  const radius = 3 + charge * 9 + pulse * 2;
  const ctx = world.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(mx, my, 0, mx, my, radius * 2.2);
  glow.addColorStop(0, withAlpha(color, 0.22 + charge * 0.6));
  glow.addColorStop(0.5, withAlpha(color, 0.08 + charge * 0.25));
  glow.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(mx, my, radius * 2.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + charge * 0.65})`;
  ctx.beginPath();
  ctx.arc(mx, my, 1.5 + charge * 2.5 + pulse, 0, TAU);
  ctx.fill();
  ctx.restore();
}
