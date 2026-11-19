export type EnemyKind = 'grunt' | 'runner' | 'tank' | 'spitter';

export type WavePhase = 'spawning' | 'intermission';

export interface HudSnapshot {
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
}

export interface GameStats {
  score: number;
  wave: number;
  kills: number;
  time: number;
}

export interface GameCallbacks {
  onHud: (hud: HudSnapshot) => void;
  onGameOver: (stats: GameStats) => void;
}

export const INITIAL_HUD: HudSnapshot = {
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
};
