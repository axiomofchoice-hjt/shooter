import { DUNGEON_ROOMS } from '../game/core/config';
import type { HudSnapshot } from '../game/types';

const CELL = 16;
const GAP = 2;
const PITCH = CELL + GAP;
const MAP_WIDTH = DUNGEON_ROOMS * PITCH - GAP;

/**
 * Top-right dungeon map: one compact row of rooms. Every cell is a single
 * flat colour — nothing is drawn in the gaps, inside a cell, or around it —
 * so a room is read by its colour alone: cleared is green, the portal is
 * violet (brighter once it is active) and the room the player is in is the
 * one solid cyan block. It shows only while no encounter is running.
 */
export function Minimap({ hud }: { hud: HudSnapshot }) {
  if (hud.mode !== 'dungeon') return null;
  const portalRoom = DUNGEON_ROOMS - 1;

  return (
    <div
      className={`minimap ${hud.encounterActive ? 'is-hidden' : ''}`}
      aria-hidden="true"
    >
      <span className="minimap-label">MAP</span>
      <svg
        className="minimap-svg"
        viewBox={`0 0 ${MAP_WIDTH} ${CELL}`}
        width={MAP_WIDTH}
        height={CELL}
        role="presentation"
      >
        {Array.from({ length: DUNGEON_ROOMS }, (_, room) => {
          const portal = room === portalRoom;
          // One class per cell: a room never mixes two colours.
          let kind = '';
          if (room === hud.room) kind = ' is-current';
          else if (portal) kind = hud.portalActive ? ' is-portal is-lit' : ' is-portal';
          else if (room >= 1 && room <= hud.roomsCleared) kind = ' is-cleared';
          return (
            <rect
              key={room}
              className={`map-room${kind}`}
              x={room * PITCH}
              y={0}
              width={CELL}
              height={CELL}
              rx={1}
            />
          );
        })}
      </svg>
    </div>
  );
}
