// Standard-mapping gamepad buttons the game reacts to.
export const PAD_BUTTON = {
  dodge: 0,
  back: 1,
  fire: 2,
  secondary: 3,
  weaponPrev: 4,
  weaponNext: 5,
  pause: 9,
} as const;

export interface GamepadSnapshot {
  connected: boolean;
  moveX: number;
  moveY: number;
  fire: boolean;
  /** Standard button indices that went down since the previous poll. */
  pressed: ReadonlySet<number>;
}

const STICK_DEADZONE = 0.18;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

function activeGamepad(
  getGamepads: () => ReadonlyArray<Gamepad | null>,
): Gamepad | null {
  for (const pad of getGamepads()) {
    if (pad?.connected) return pad;
  }
  return null;
}

// Kept behind a function so the poller can be exercised without a real pad.
function systemGamepads(): ReadonlyArray<Gamepad | null> {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return navigator.getGamepads();
}

function readButtons(pad: Gamepad, out: boolean[]): boolean[] {
  out.length = pad.buttons.length;
  for (let i = 0; i < pad.buttons.length; i++) {
    const button = pad.buttons[i];
    out[i] = Boolean(button && (button.pressed || button.value > 0.5));
  }
  return out;
}

function readMove(pad: Gamepad, down: boolean[]) {
  let x = Number(pad.axes[0] ?? 0);
  let y = Number(pad.axes[1] ?? 0);
  if (!Number.isFinite(x)) x = 0;
  if (!Number.isFinite(y)) y = 0;

  const magnitude = Math.hypot(x, y);
  if (magnitude < STICK_DEADZONE) {
    // Resting stick: let the D-pad drive movement instead.
    return {
      x: (down[DPAD_RIGHT] ? 1 : 0) - (down[DPAD_LEFT] ? 1 : 0),
      y: (down[DPAD_DOWN] ? 1 : 0) - (down[DPAD_UP] ? 1 : 0),
    };
  }

  // Rescale so the edge of the deadzone maps to zero and full tilt stays 1.
  const scale =
    Math.min(1, (magnitude - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / magnitude;
  return { x: x * scale, y: y * scale };
}

export function createGamepadPoller(
  getGamepads: () => ReadonlyArray<Gamepad | null> = systemGamepads,
) {
  // Buffers are reused between polls: this runs once per animation frame, and
  // fresh arrays for a 60Hz loop are pure garbage.
  let previous: boolean[] = [];
  let current: boolean[] = [];
  const pressed = new Set<number>();
  let previousId: string | null = null;

  return {
    poll(): GamepadSnapshot {
      const pad = activeGamepad(getGamepads);
      if (!pad) {
        previous.length = 0;
        previousId = null;
        pressed.clear();
        return {
          connected: false,
          moveX: 0,
          moveY: 0,
          fire: false,
          pressed,
        };
      }

      if (pad.id !== previousId) {
        // A different controller just took over: forget the old edges.
        previous.length = 0;
        previousId = pad.id;
      }

      const down = readButtons(pad, current);
      pressed.clear();
      for (let index = 0; index < down.length; index++) {
        if (down[index] && !previous[index]) pressed.add(index);
      }
      // Swap the buffers: the old "previous" array is scratch space now.
      const scratch = previous;
      previous = down;
      current = scratch;

      const move = readMove(pad, down);
      return {
        connected: true,
        moveX: move.x,
        moveY: move.y,
        fire: down[PAD_BUTTON.fire] === true,
        pressed,
      };
    },
  };
}
