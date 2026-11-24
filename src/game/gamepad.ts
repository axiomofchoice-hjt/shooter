// Standard-mapping gamepad buttons the game reacts to. Triggers report
// `pressed` above their threshold, so RT works as a hold-to-fire button.
export const PAD_BUTTON = {
  dodge: 0,
  back: 1,
  secondary: 2,
  weapon: 3,
  fire: 7,
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

function readButtons(pad: Gamepad): boolean[] {
  return pad.buttons.map((button) => button.pressed || button.value > 0.5);
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
  let previous: boolean[] = [];
  let previousId: string | null = null;

  return {
    poll(): GamepadSnapshot {
      const pad = activeGamepad(getGamepads);
      if (!pad) {
        previous = [];
        previousId = null;
        return {
          connected: false,
          moveX: 0,
          moveY: 0,
          fire: false,
          pressed: new Set(),
        };
      }

      if (pad.id !== previousId) {
        // A different controller just took over: forget the old edges.
        previous = [];
        previousId = pad.id;
      }

      const down = readButtons(pad);
      const pressed = new Set<number>();
      down.forEach((isDown, index) => {
        if (isDown && !previous[index]) pressed.add(index);
      });
      previous = down;

      const move = readMove(pad, down);
      return {
        connected: true,
        moveX: move.x,
        moveY: move.y,
        fire: Boolean(down[PAD_BUTTON.fire]),
        pressed,
      };
    },
  };
}
