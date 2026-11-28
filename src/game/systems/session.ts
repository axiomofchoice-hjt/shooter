/** Starting a run and returning to the menu. */

import { BOSS_SIZE, DUNGEON_WIDTH, ROOM_SIZE } from '../core/config';
import {
  pickTestArmor,
  pickTestEnemies,
  pickTestWeapons,
} from '../core/testRoom';
import type { GameWorld } from '../core/world';
import { warmArcStroke } from '../render/weapons';
import { isArenaMode, type GameMode, type TestRoomConfig } from '../types';
import { DUNGEON_ARMOR } from '../armors';
import { DUNGEON_LOADOUT } from '../weapons';
import { emitHud } from './hud';
import { beginBossRoom, beginRun, beginTestRoom, resetWorld } from './rooms';
import { buildDecorations, updateZoom } from './world';

// ---------------------------------------------------------------- public API
export function startRun(
  world: GameWorld,
  mode: GameMode = 'dungeon',
  config?: TestRoomConfig,
) {
  world.mode = mode;
  // The dungeon and the boss room carry the dungeon loadout; the test room
  // carries the weapons picked on the start screen. Neither list makes a
  // weapon unavailable.
  world.weaponPool =
    mode === 'test' ? pickTestWeapons(config?.weapons) : DUNGEON_LOADOUT;
  world.testEnemies = mode === 'test' ? pickTestEnemies(config?.enemies) : ['grunt'];
  world.armor = mode === 'test' ? pickTestArmor(config?.armor) : DUNGEON_ARMOR;
  const arena = isArenaMode(mode);
  world.worldW = arena ? BOSS_SIZE : DUNGEON_WIDTH;
  world.worldH = arena ? BOSS_SIZE : ROOM_SIZE;
  updateZoom(world);
  buildDecorations(world);
  world.sfx.unlock();
  resetWorld(world);
  if (world.weaponPool.includes('arc')) warmArcStroke(world);
  world.phase = 'playing';
  world.paused = false;
  if (mode === 'test') {
    beginTestRoom(world);
  } else if (mode === 'boss') {
    beginBossRoom(world);
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
  world.armor = DUNGEON_ARMOR;
  world.worldW = DUNGEON_WIDTH;
  world.worldH = ROOM_SIZE;
  updateZoom(world);
  buildDecorations(world);
  resetWorld(world);
  emitHud(world, true);
}
