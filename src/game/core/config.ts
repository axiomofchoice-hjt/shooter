/** Gameplay tuning and visual constants. */

// Dungeon layout: five 1000x1000 rooms in a straight horizontal line.
export const ROOM_SIZE = 1000;
export const DUNGEON_ROOMS = 5;
export const DUNGEON_WIDTH = ROOM_SIZE * DUNGEON_ROOMS;
export const BOSS_SIZE = 1000;
export const WALL_THICK = 52;
export const WALL_PAD = WALL_THICK / 2;
export const DOOR_HALF = 118;
export const DOOR_Y = ROOM_SIZE / 2;
// Practice dummy: below the player, clear of the start banner and the door.
export const DUMMY_X = ROOM_SIZE / 2;
export const DUMMY_Y = ROOM_SIZE / 2 + 150;
// Parabola-gun item: a fixed pull toward the player at the hit moment, plus a
// random sideways bend on launch, so it loops away and back.
export const LOB_ACCEL = 600;
export const LOB_INITIAL_SPEED = 300;
export const LOB_LATERAL_MAX = 240;
// Speed cap for the item, applied after each acceleration step. The launch
// sits at the cap, so the pull can only slow the outbound leg; the return leg
// holds a steady 300px/s.
export const LOB_MAX_SPEED = 300;
export const LOB_RADIUS = 7;
export const LOB_LIFE = 4.5;
export const LOB_MAX = 16;
export const PORTAL_X = (DUNGEON_ROOMS - 1) * ROOM_SIZE + ROOM_SIZE / 2;
export const PORTAL_Y = ROOM_SIZE / 2;
export const PORTAL_RADIUS = 46;
export const CLEAR_HEAL = 12;
export const FLOOR_HEAL = 18;
export const AUTOAIM_RANGE = 1400;

// Camera framing is the same on every device: the view keeps roughly one
// screen-height of world (VIEW_WORLD_H) visible vertically, and never shows
// less than the full 1000-wide room. Phones used to see ~518 world pixels of
// height against a desktop's 672, which made them read as much harder simply
// because threats appeared later, so the height target now drives the zoom.
export const VIEW_WORLD_H = 660;
export const VIEW_MIN_ZOOM = 0.62;
export const VIEW_MAX_ZOOM = 1.28;

// Camera: ease toward the player, biased a little toward nearby enemies so
// the action stays framed. It is not locked to one room, so the edge of the
// view can show the neighbouring room.
export const CAMERA = {
  /** Exponential follow rate; higher is snappier. */
  followRate: 2.5,
  /** How quickly the enemy offset itself eases, after the death hold. */
  biasRate: 1.2,
  /** Seconds the enemy offset is held after an enemy dies. */
  deathHold: 0.8,
  /** Fraction of the weighted enemy offset applied to the target. */
  enemyBias: 0.28,
  /** Enemies farther than this do not pull the camera. */
  enemyRange: 560,
  /** Largest camera offset from the player, in world px. */
  maxOffset: 120,
  /** How far past the world edge the camera centre may travel. */
  outsidePad: 240,
} as const;

export const PLAYER_COLOR = '#5ff6ff';
export const SECONDARY_COLOR = '#ffc857';
export const ENEMY_GLOW = 0.16;

export const PLAYER_SPEED = 270;
export const PLAYER_START_ANGLE = -Math.PI / 2;

// The orthogonal cannon may only leave along these four screen directions.
export const CARDINAL_DIRS = [
  { angle: 0, x: 1, y: 0 },
  { angle: Math.PI / 2, x: 0, y: 1 },
  { angle: Math.PI, x: -1, y: 0 },
  { angle: -Math.PI / 2, x: 0, y: -1 },
];

// Splitter: lobs one shell at where the player stood when it fired. The shell
// bursts into a ring of faster, long-range bullets where it lands, or early if
// it touches anything of the player's.
export const SHELL_SPEED = 250;
export const SHELL_RADIUS = 9;
export const SHELL_FLIGHT_TIME = 5;
export const SPLIT_RING_COUNT = 20;
export const SPLIT_BULLET_SPEED = 430;
export const SPLIT_BULLET_LIFE = 999;
export const SPLIT_BULLET_DAMAGE = 8;

// Homing: the missile steers after the player for a short window, then loses
// its lock and flies straight. Touching a wall or the player sets off a small
// blast; after running out of life it just fizzles out.
export const HOMING_COLOR = '#ff5bd0';
export const HOMING_SPEED = 255;
// Steering is capped, so a well-timed dodge breaks the lock instead of the
// missile simply outrunning the player.
export const HOMING_TURN_RATE = 2.2;
export const HOMING_SEEK_TIME = 2.2;
export const HOMING_LIFE = 7;
export const HOMING_RADIUS = 7;
export const HOMING_BLAST_RADIUS = 34;
export const HOMING_BLAST_DAMAGE = 6;
export const HOMING_TRAIL_POINTS = 9;

// Flamer damage is applied on fixed ticks so its DPS does not depend on fps.
export const FLAME_TICK = 0.05;

// Storm dart zaps at 90%, 95%, 100%, 105% and 110% of the target distance.
export const STORM_PULSE_COUNT = 5;

export const SECONDARY_COOLDOWN = 3.4;
export const SECONDARY_PELLETS = 7;
// Dodge: a fixed 170px slide covered in 0.33s (~515px/s, 1.91x the walk
// speed). The 0.6s cooldown only starts counting once the slide is over.
export const DODGE_COOLDOWN = 0.6;
export const DASH_DISTANCE = 170;
export const DASH_TIME = 0.33;
export const DASH_SPEED = DASH_DISTANCE / DASH_TIME;

export const BOSS_HP = 320;
export const BOSS_RADIUS = 58;
export const BOSS_COLOR = '#ff3860';
export const TEST_COLOR = '#ff9f43';
export const BOSS_CONTACT_DAMAGE = 28;
export const BOSS_SCORE = 1600;
export const BOSS_VICTORY_DELAY = 1.6;

// Enemy behaviour timer: every enemy replays a shuffled rotation of one move,
// one attack and two idle actions, then rolls a fresh rotation.
export const ENEMY_LEGS_MIN = 3;
export const ENEMY_LEGS_MAX = 5;
// Each hop lands on a ring around the position the move action started from.
export const ENEMY_RING_MIN = 58;
export const ENEMY_RING_MAX = 108;
// 80% of the hops correct the distance to the enemy's preferred range.
export const ENEMY_APPROACH_CHANCE = 0.8;
export const ENEMY_IDLE_JITTER = 0.5;
export const ENEMY_LEG_TIMEOUT = 1.8;
export const ENEMY_LANE_PAD = 20;
