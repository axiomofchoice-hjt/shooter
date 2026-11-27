export type GameMode = 'dungeon' | 'boss';

export type EnemyKind =
  | 'grunt'
  | 'runner'
  | 'tank'
  | 'spitter'
  | 'splitter'
  | 'homing'
  | 'boss';

export type WeaponId =
  | 'pulse'
  | 'smg'
  | 'scatter'
  | 'rail'
  | 'seeker'
  | 'flamer'
  | 'arc'
  | 'shock'
  | 'storm'
  | 'laser'
  | 'carom'
  | 'orbit'
  | 'fission'
  | 'summoner'
  | 'recycler'
  | 'bomber'
  | 'ortho'
  | 'volley'
  | 'funnel'
  | 'coop'
  | 'partner'
  | 'ram'
  | 'bubble'
  | 'dart'
  | 'minefield';

/** Armor slot. The player carries exactly one of these at a time. */
export type ArmorId = 'shield' | 'deflector';

/** Everything the test room can spawn; the dungeon boss stays out of it. */
export type TestEnemyKind = Exclude<EnemyKind, 'boss'>;

/** Canonical order for the enemy picker and the HUD roster. */
export const TEST_ENEMY_KINDS: TestEnemyKind[] = [
  'grunt',
  'runner',
  'tank',
  'spitter',
  'splitter',
  'homing',
];

export const ENEMY_LABELS: Record<EnemyKind, string> = {
  grunt: '突击者',
  runner: '疾行者',
  tank: '重甲',
  spitter: '喷吐者',
  splitter: '分裂者',
  homing: '追踪者',
  boss: '压制核心',
};

/** What a test-room run carries: weapons, enemies and the single armor. */
export interface TestRoomConfig {
  weapons: WeaponId[];
  enemies: TestEnemyKind[];
  /** One armor slot; omitted means the default shield. */
  armor?: ArmorId;
}

export type RoomKind = 'start' | 'combat' | 'portal';

export const ROOM_COUNT = 5;

export function roomKindAt(room: number): RoomKind {
  if (room <= 0) return 'start';
  if (room >= ROOM_COUNT - 1) return 'portal';
  return 'combat';
}

export interface HudSnapshot {
  mode: GameMode;
  weapon: WeaponId;
  hp: number;
  maxHp: number;
  /** Shield points left; `shieldMax` is 0 when no armor is equipped. */
  shield: number;
  shieldMax: number;
  /** Armor in the single slot, so the HUD can name it. */
  armor: ArmorId;
  /** Seconds the deflector arc still cannot turn (0 when ready). */
  armorLock: number;
  score: number;
  combo: number;
  comboTime: number;
  kills: number;
  muted: boolean;
  dodgeCooldown: number;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: number;
  /** Test-room wave counter (boss mode only). */
  wave: number;
  /** Live test-room roster, so the HUD can name what is left. */
  testRoster: { kind: TestEnemyKind; count: number }[];
  /** Main weapons reachable with the switch button in the current mode. */
  weaponCount: number;
  floor: number;
  room: number;
  roomKind: RoomKind;
  roomsCleared: number;
  enemiesRemaining: number;
  encounterActive: boolean;
  portalActive: boolean;
  /** Render frame rate, sampled over a short window (0 until the first sample). */
  fps: number;
}

export interface GameStats {
  mode: GameMode;
  score: number;
  kills: number;
  time: number;
  floor: number;
  roomsCleared: number;
  /** Test-room wave reached (boss mode only). */
  wave: number;
}

export interface GameCallbacks {
  onHud: (hud: HudSnapshot) => void;
  onGameOver: (stats: GameStats, victory: boolean) => void;
}

export const INITIAL_HUD: HudSnapshot = {
  mode: 'dungeon',
  weapon: 'pulse',
  hp: 100,
  maxHp: 100,
  shield: 0,
  shieldMax: 0,
  armor: 'shield',
  armorLock: 0,
  score: 0,
  combo: 0,
  comboTime: 0,
  kills: 0,
  muted: false,
  dodgeCooldown: 0,
  bossHp: 0,
  bossMaxHp: 0,
  bossPhase: 1,
  wave: 0,
  testRoster: [],
  weaponCount: 1,
  floor: 1,
  room: 0,
  roomKind: 'start',
  roomsCleared: 0,
  enemiesRemaining: 0,
  encounterActive: false,
  portalActive: false,
  fps: 0,
};
