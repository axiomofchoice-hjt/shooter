import { GameWorld } from './core/world';
import { render } from './render/render';
import { emitHud } from './systems/hud';
import { resetInputState } from './systems/input';
import { sampleFps, update, updateAmbient } from './systems/loop';
import { beginDodge, switchWeapon } from './systems/player';
import { resetWorld } from './systems/rooms';
import { resetToMenu, startRun } from './systems/session';
import { fireSecondary } from './systems/weapons';
import { buildDecorations, resize } from './systems/world';
import type { GameCallbacks, GameMode, TestRoomConfig } from './types';

/**
 * User-facing facade for the game. All mutable state lives in `GameWorld`
 * (see core/world.ts); the actual simulation and rendering live in the
 * `systems/` and `render/` modules. This class only owns the canvas lifecycle,
 * the frame loop and the input/HUD entry points used by React.
 */
export class ShooterGame {
  private world: GameWorld;

  private resizeObserver: ResizeObserver;
  private raf = 0;
  private lastTime = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.world = new GameWorld(canvas, callbacks);
    this.resizeObserver = new ResizeObserver(() => resize(this.world));
    this.resizeObserver.observe(canvas);
    resize(this.world);
    buildDecorations(this.world);
    resetWorld(this.world);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  start(mode: GameMode = 'dungeon', config?: TestRoomConfig) {
    startRun(this.world, mode, config);
  }

  toMenu() {
    resetToMenu(this.world);
  }

  setPaused(paused: boolean) {
    if (this.world.phase !== 'playing') return;
    this.world.paused = paused;
    if (paused) resetInputState(this.world);
  }

  isPaused() {
    return this.world.paused;
  }

  toggleMute() {
    const muted = this.world.sfx.toggle();
    emitHud(this.world, true);
    return muted;
  }

  setKey(code: string, down: boolean) {
    const wasDown = this.world.input.keys.has(code);
    if (down) this.world.input.keys.add(code);
    else this.world.input.keys.delete(code);
    if (code === 'KeyJ' && down !== wasDown) {
      this.world.input.fireKey = down;
    }
  }

  setTouchMove(x: number, y: number) {
    this.world.input.touchX = x;
    this.world.input.touchY = y;
  }

  setTouchFire(active: boolean) {
    this.world.input.touchFire = active;
  }

  setGamepadMove(x: number, y: number) {
    this.world.input.padX = x;
    this.world.input.padY = y;
  }

  setGamepadFire(active: boolean) {
    this.world.input.padFire = active;
  }

  triggerSecondary() {
    const world = this.world;
    if (
      world.phase !== 'playing' ||
      world.paused ||
      world.player.dead ||
      world.secondaryCooldown > 0
    ) {
      return;
    }
    fireSecondary(world);
  }

  triggerDodge() {
    beginDodge(this.world);
  }

  cycleWeapon(direction: 1 | -1 = 1) {
    switchWeapon(this.world, direction);
  }

  clearInput() {
    resetInputState(this.world);
  }

  dispose() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
  }

  private loop(time: number) {
    if (this.destroyed) return;
    // Keep the real frame delta for the FPS readout; the simulation clamps it
    // so a slow frame cannot teleport anything across the room.
    const frameSeconds = this.lastTime ? Math.max(0, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    const dt = Math.min(0.033, frameSeconds);
    sampleFps(this.world, frameSeconds);
    this.world.ambientTime += dt;

    if (this.world.phase === 'playing' && !this.world.paused) {
      this.world.elapsed += dt;
      update(this.world, dt);
    } else {
      updateAmbient(this.world, dt);
    }

    render(this.world);
    this.raf = requestAnimationFrame(this.loop);
  }
}
