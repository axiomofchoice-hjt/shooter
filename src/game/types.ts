export type GameMode = 'dungeon' | 'boss';

export type EnemyKind = 'grunt' | 'runner' | 'tank' | 'spitter' | 'splitter' | 'boss';

export type WeaponId = 'pulse' | 'smg' | 'scatter' | 'rail';

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
  score: number;
  combo: number;
  comboTime: number;
  kills: number;
  muted: boolean;
  secondaryCooldown: number;
  dodgeCooldown: number;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: number;
  /** Test-room wave counter (boss mode only). */
  wave: number;
  floor: number;
  room: number;
  roomKind: RoomKind;
  roomsCleared: number;
  enemiesRemaining: number;
  encounterActive: boolean;
  portalActive: boolean;
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
  score: 0,
  combo: 0,
  comboTime: 0,
  kills: 0,
  muted: false,
  secondaryCooldown: 0,
  dodgeCooldown: 0,
  bossHp: 0,
  bossMaxHp: 0,
  bossPhase: 1,
  wave: 0,
  floor: 1,
  room: 0,
  roomKind: 'start',
  roomsCleared: 0,
  enemiesRemaining: 0,
  encounterActive: false,
  portalActive: false,
};
