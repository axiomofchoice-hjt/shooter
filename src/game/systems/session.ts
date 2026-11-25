/** Starting a run and returning to the menu. */

import { BOSS_SIZE, DUNGEON_WIDTH, ROOM_SIZE } from '../core/config';
import { pickTestEnemies, pickTestWeapons } from '../core/testRoom';
import type { GameWorld } from '../core/world';
import { warmArcStroke } from '../render/weapons';
import type { GameMode, TestRoomConfig } from '../types';
import { DUNGEON_LOADOUT } from '../weapons';
import { emitHud } from './hud';
import { beginRun, beginTestRoom, resetWorld } from './rooms';
import { buildDecorations, updateZoom } from './world';

// ---------------------------------------------------------------- public API
export function startRun(
  world: GameWorld,
  mode: GameMode = 'dungeon',
  config?: TestRoomConfig,
) {
  world.mode = mode;
  // The dungeon carries its loadout; the test room carries the weapons
  // picked on the start screen. Neither list makes a weapon unavailable.
  world.weaponPool =
    mode === 'boss' ? pickTestWeapons(config?.weapons) : DUNGEON_LOADOUT;
  world.testEnemies = mode === 'boss' ? pickTestEnemies(config?.enemies) : ['grunt'];
  world.worldW = mode === 'boss' ? BOSS_SIZE : DUNGEON_WIDTH;
  world.worldH = mode === 'boss' ? BOSS_SIZE : ROOM_SIZE;
  updateZoom(world);
  buildDecorations(world);
  world.sfx.unlock();
  resetWorld(world);
  if (world.weaponPool.includes('arc')) warmArcStroke(world);
  world.phase = 'playing';
  world.paused = false;
  if (mode === 'boss') {
    beginTestRoom(world);
  } else {
    beginRun(world);
  }
  emitHud(world, true);
}

export function resetToMenu(world: GameWorld) {
  world.phase = 'idle';
  world.paused = false;
  world.mode = 'dungeon';
  world.weaponPool = DUNGEON_LOADOUT;
  world.testEnemies = ['grunt'];
  world.worldW = DUNGEON_WIDTH;
  world.worldH = ROOM_SIZE;
  updateZoom(world);
  buildDecorations(world);
  resetWorld(world);
  emitHud(world, true);
}
