/** Frame render orchestration. */

import { rand } from '../core/math';
import type { GameWorld } from '../core/world';
import { drawEnemies } from './enemies';
import { drawAutoTarget, drawFloaters, drawOverlayEffects, drawParticles } from './fx';
import { drawFunnels, drawPartner } from './funnels';
import { drawBanner, drawMenuAtmosphere } from './overlay';
import { drawDashGhosts, drawPlayer } from './player';
import {
  drawBlasts,
  drawBullets,
  drawEnemyBullets,
  drawHomings,
  drawShells,
  drawShockwaves,
  drawStormDarts,
} from './projectiles';
import {
  drawBomberShadows,
  drawFireRings,
  drawPickups,
  drawPortal,
  drawTelegraphs,
  drawWeaponRange,
} from './props';
import { drawBackdrop, drawFloor } from './scene';
import { drawOrbs, drawTurrets } from './turrets';
import {
  drawArcs,
  drawBomberStatus,
  drawBombers,
  drawFlamer,
  drawLaserBeams,
  drawLaserMuzzleGlow,
  drawRamBlasts,
  drawRecycleStatus,
} from './weapons';

// -------------------------------------------------------------------- render
export function render(world: GameWorld) {
  const ctx = world.ctx;
  const { width, height, zoom } = world;
  const shakeX = world.shake > 0 ? rand(-world.shake, world.shake) : 0;
  const shakeY = world.shake > 0 ? rand(-world.shake, world.shake) : 0;

  ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  drawBackdrop(world, width, height);

  ctx.save();
  ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
  ctx.scale(zoom, zoom);
  ctx.translate(-world.camera.x, -world.camera.y);

  drawFloor(world);
  drawWeaponRange(world);
  drawBomberShadows(world);
  drawPortal(world);
  drawTelegraphs(world);
  drawFireRings(world);
  drawPickups(world);
  drawTurrets(world);
  drawEnemyBullets(world);
  drawBullets(world);
  drawEnemies(world);
  drawShells(world);
  drawHomings(world);
  drawBlasts(world);
  drawDashGhosts(world);
  drawPlayer(world);
  drawFunnels(world);
  drawPartner(world);
  drawRecycleStatus(world);
  drawBomberStatus(world);
  drawOrbs(world);
  drawLaserMuzzleGlow(world);
  drawStormDarts(world);
  drawFlamer(world);
  drawArcs(world);
  drawLaserBeams(world);
  drawShockwaves(world);
  drawRamBlasts(world);
  drawParticles(world);
  drawFloaters(world);
  drawBombers(world);
  drawAutoTarget(world);

  ctx.restore();

  drawOverlayEffects(world, shakeX, shakeY);
  if (world.banner) drawBanner(world);
  if (world.phase === 'idle') {
    drawMenuAtmosphere(world);
  }
}
