import type { GameWorld } from '../core/world';

export function resetInputState(world: GameWorld) {
  world.input.keys.clear();
  world.input.fireKey = false;
  world.input.touchX = 0;
  world.input.touchY = 0;
  world.input.touchFire = false;
  world.input.padX = 0;
  world.input.padY = 0;
  world.input.padFire = false;
  world.volleyShots = 0;
  world.volleyFiring = false;
}

export function readMoveInput(world: GameWorld) {
  let x = 0;
  let y = 0;
  // Pad beats touch beats keys when more than one is active, so a plugged-in
  // controller keeps working on touch-capable hardware.
  const padMag = Math.hypot(world.input.padX, world.input.padY);
  const touchMag = Math.hypot(world.input.touchX, world.input.touchY);
  if (padMag > 0.12) {
    x = world.input.padX;
    y = world.input.padY;
  } else if (touchMag > 0.12) {
    x = world.input.touchX;
    y = world.input.touchY;
  } else {
    const keys = world.input.keys;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  }
  return { x, y, magnitude: Math.hypot(x, y) };
}
