import { DUNGEON_ROOMS, TEST_COLOR } from '../core/config';
import { withAlpha } from '../core/math';
import type { GameWorld } from '../core/world';

export function roomAccent(world: GameWorld, room: number) {
  if (world.mode === 'boss') return TEST_COLOR;
  if (room === 0) return '#5ff6ff';
  if (room === DUNGEON_ROOMS - 1) return '#c08bff';
  return world.roomCleared[room] ? '#7dff9b' : '#ff5f7d';
}

export function roomBaseColor(world: GameWorld, room: number) {
  if (world.mode === 'boss') return '#140e07';
  if (room === 0) return '#071119';
  if (room === DUNGEON_ROOMS - 1) return '#0c0817';
  return world.roomCleared[room] ? '#08140f' : '#0c0c17';
}

/** Cached point glow: draw around (0,0) after translating to the spot. */
export function glow(world: GameWorld, color: string, core: number, radius: number) {
  const key = `${color}|${core}|${radius}`;
  const cached = world.glowCache.get(key);
  if (cached) return cached;
  const gradient = world.ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, withAlpha(color, core));
  gradient.addColorStop(0.45, withAlpha(color, core * 0.45));
  gradient.addColorStop(1, withAlpha(color, 0));
  world.glowCache.set(key, gradient);
  return gradient;
}
