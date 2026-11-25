import type { EnemyKind } from '../types';
import {
  BOSS_COLOR,
  BOSS_CONTACT_DAMAGE,
  BOSS_HP,
  BOSS_RADIUS,
  BOSS_SCORE,
  HOMING_COLOR,
  TEST_COLOR,
} from './config';

export interface EnemyDef {
  radius: number;
  hp: number;
  speed: number;
  damage: number;
  score: number;
  color: string;
}

export type EnemyAction = 'move' | 'attack' | 'idle';
export const ENEMY_ACTIONS: EnemyAction[] = ['move', 'attack', 'idle', 'idle'];

export type AttackPhase = 'windup' | 'active' | 'recover';

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  grunt: { radius: 16, hp: 4, speed: 86, damage: 12, score: 10, color: '#ff4d7d' },
  runner: { radius: 12, hp: 3, speed: 154, damage: 8, score: 15, color: '#ffc857' },
  tank: { radius: 26, hp: 16, speed: 52, damage: 22, score: 35, color: '#b48cff' },
  spitter: { radius: 16, hp: 6, speed: 66, damage: 10, score: 25, color: '#7dff9b' },
  splitter: { radius: 18, hp: 9, speed: 62, damage: 10, score: 30, color: TEST_COLOR },
  homing: { radius: 17, hp: 10, speed: 64, damage: 10, score: 35, color: HOMING_COLOR },
  boss: {
    radius: BOSS_RADIUS,
    hp: BOSS_HP,
    speed: 60,
    damage: BOSS_CONTACT_DAMAGE,
    score: BOSS_SCORE,
    color: BOSS_COLOR,
  },
};

export interface EnemyAttackDef {
  /**
   * sweep = a line segment spinning once around the enemy, shot = direct
   * bullets, shell = one lobbed projectile that splits into a ring,
   * homing = missiles that chase for a while and then fly straight.
   */
  mode: 'sweep' | 'shot' | 'shell' | 'homing';
  /** 前摇: telegraph before the hit lands. */
  windup: number;
  /** 判定: sweep duration / burst window. */
  active: number;
  /** 后摇: recovery before the next action. */
  recovery: number;
  /** Blade length, or max firing range for shots. */
  reach: number;
  damage: number;
  shots: number;
  interval: number;
}

export interface EnemyBehaviorDef {
  /** Preferred distance to the player: melee hugs, ranged keeps its space. */
  range: number;
  /** Deliberately slow shuffle speed (px/s) for the straight-line hops. */
  moveSpeed: number;
  attack: EnemyAttackDef;
}

export const ENEMY_BEHAVIOR: Record<EnemyKind, EnemyBehaviorDef> = {
  grunt: {
    range: 105,
    moveSpeed: 70,
    attack: {
      mode: 'sweep',
      windup: 0.55,
      active: 0.5,
      recovery: 0.4,
      reach: 120,
      damage: 12,
      shots: 1,
      interval: 0,
    },
  },
  runner: {
    range: 85,
    moveSpeed: 112,
    attack: {
      mode: 'sweep',
      windup: 0.32,
      active: 0.36,
      recovery: 0.26,
      reach: 96,
      damage: 8,
      shots: 1,
      interval: 0,
    },
  },
  tank: {
    range: 138,
    moveSpeed: 46,
    attack: {
      mode: 'sweep',
      windup: 0.85,
      active: 0.9,
      recovery: 0.6,
      reach: 172,
      damage: 22,
      shots: 1,
      interval: 0,
    },
  },
  spitter: {
    range: 430,
    moveSpeed: 60,
    attack: {
      mode: 'shot',
      windup: 0.6,
      active: 0.52,
      recovery: 0.45,
      reach: 640,
      damage: 9,
      shots: 3,
      interval: 0.18,
    },
  },
  splitter: {
    range: 400,
    moveSpeed: 62,
    attack: {
      mode: 'shell',
      windup: 0.75,
      active: 0.12,
      recovery: 0.6,
      reach: 900,
      damage: 12,
      shots: 1,
      interval: 0,
    },
  },
  homing: {
    range: 460,
    moveSpeed: 60,
    attack: {
      mode: 'homing',
      windup: 0.8,
      active: 0.5,
      recovery: 0.7,
      reach: 900,
      damage: 10,
      shots: 2,
      interval: 0.34,
    },
  },
  // The boss keeps its own scripted pattern; this entry is only a fallback.
  boss: {
    range: 300,
    moveSpeed: 60,
    attack: {
      mode: 'sweep',
      windup: 0.6,
      active: 0.5,
      recovery: 0.4,
      reach: 120,
      damage: BOSS_CONTACT_DAMAGE,
      shots: 1,
      interval: 0,
    },
  },
};
