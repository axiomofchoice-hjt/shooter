export type GameMode = 'survival' | 'boss';

export type EnemyKind = 'grunt' | 'runner' | 'tank' | 'spitter' | 'boss';

export type WeaponId = 'pulse' | 'smg' | 'scatter' | 'rail';

export type WavePhase = 'spawning' | 'intermission';

export interface HudSnapshot {
  mode: GameMode;
  weapon: WeaponId;
  hp: number;
  maxHp: number;
  score: number;
  wave: number;
  wavePhase: WavePhase;
  enemiesRemaining: number;
  nextWaveIn: number;
  combo: number;
  comboTime: number;
  kills: number;
  muted: boolean;
  secondaryCooldown: number;
  dodgeCooldown: number;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: number;
}

export interface GameStats {
  mode: GameMode;
  score: number;
  wave: number;
  kills: number;
  time: number;
}

export interface GameCallbacks {
  onHud: (hud: HudSnapshot) => void;
  onGameOver: (stats: GameStats, victory: boolean) => void;
}

export const INITIAL_HUD: HudSnapshot = {
  mode: 'survival',
  weapon: 'pulse',
  hp: 100,
  maxHp: 100,
  score: 0,
  wave: 1,
  wavePhase: 'intermission',
  enemiesRemaining: 0,
  nextWaveIn: 0,
  combo: 0,
  comboTime: 0,
  kills: 0,
  muted: false,
  secondaryCooldown: 0,
  dodgeCooldown: 0,
  bossHp: 0,
  bossMaxHp: 0,
  bossPhase: 1,
};
