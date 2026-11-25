/** Per-frame update scheduling and FPS sampling. */

import { PLAYER_START_ANGLE, ROOM_SIZE } from '../core/config';
import type { GameWorld } from '../core/world';
import { finishBossFight } from './boss';
import { updateBullets, updateEnemyBullets } from './combat';
import { updateEnemies } from './enemies';
import { updateHomings, updateShells } from './enemyProjectiles';
import { updateFloaters, updateFx, updateParticles } from './fx';
import { emitHud } from './hud';
import { updatePickups } from './pickups';
import { updatePlayer } from './player';
import { updateDungeon, updateTestRoom } from './rooms';
import { updateTurrets } from './turrets';
import { updateBombers, updateLobItems, updateStormDarts } from './weaponItems';
import { updateCamera } from './world';

/**
 * Averages frame deltas over a 0.25s window. The HUD is only re-rendered
 * every 0.09s, so the window is long enough to stay readable but short
 * enough to react when the frame budget starts slipping.
 */
export function sampleFps(world: GameWorld, frameSeconds: number) {
  if (frameSeconds <= 0 || frameSeconds > 1) {
    // Backgrounded tab or a very long stall: don't mix that gap into the
    // window, it would only show a meaningless single-digit number.
    world.fpsFrames = 0;
    world.fpsElapsed = 0;
    return;
  }
  world.fpsFrames += 1;
  world.fpsElapsed += frameSeconds;
  if (world.fpsElapsed >= 0.25) {
    world.fps = Math.round(world.fpsFrames / world.fpsElapsed);
    world.fpsFrames = 0;
    world.fpsElapsed = 0;
  }
}

export function update(world: GameWorld, dt: number) {
  updatePlayer(world, dt);
  updateBullets(world, dt);
  updateLobItems(world, dt);
  updateStormDarts(world, dt);
  updateBombers(world, dt);
  updateEnemies(world, dt);
  updateTurrets(world, dt);
  updateEnemyBullets(world, dt);
  updateShells(world, dt);
  updateHomings(world, dt);
  updatePickups(world, dt);
  if (world.mode === 'dungeon') updateDungeon(world, dt);
  else updateTestRoom(world, dt);
  updateFx(world, dt);
  updateCamera(world);

  if (world.victoryTimer > 0) {
    world.victoryTimer -= dt;
    if (world.victoryTimer <= 0) finishBossFight(world);
  }

  world.hurtFlash = Math.max(0, world.hurtFlash - dt * 2.6);
  world.healFlash = Math.max(0, world.healFlash - dt * 2.2);
  world.killFlash = Math.max(0, world.killFlash - dt * 7);
  world.shake = Math.max(0, world.shake - dt * 38);

  world.hudTimer -= dt;
  if (world.hudTimer <= 0) {
    world.hudTimer = 0.09;
    emitHud(world, true);
  }
}

export function updateAmbient(world: GameWorld, dt: number) {
  world.shake = Math.max(0, world.shake - dt * 30);
  world.hurtFlash = Math.max(0, world.hurtFlash - dt * 2);
  updateParticles(world, dt);
  updateFloaters(world, dt);
  if (world.banner) {
    world.banner.time -= dt;
    if (world.banner.time <= 0) world.banner = null;
  }
  if (world.phase === 'idle') {
    world.player.angle =
      PLAYER_START_ANGLE + Math.sin(world.ambientTime * 0.55) * 0.25;
    world.camera.x += (ROOM_SIZE / 2 - world.camera.x) * Math.min(1, dt * 2);
    world.camera.y += (world.worldH / 2 - world.camera.y) * Math.min(1, dt * 2);
  }
}
