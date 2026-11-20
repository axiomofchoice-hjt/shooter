import type { HudSnapshot } from '../game/types';
import { WEAPONS } from '../game/weapons';
import { PauseIcon, SoundOffIcon, SoundOnIcon } from './Icons';

interface HudProps {
  hud: HudSnapshot;
  onPause: () => void;
  onMute: () => void;
}

export function Hud({ hud, onPause, onMute }: HudProps) {
  const hpPercent = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const critical = hpPercent <= 30;
  const multiplier = 1 + Math.min(20, Math.max(0, hud.combo - 1)) * 0.1;
  const isBoss = hud.mode === 'boss';
  const weapon = WEAPONS[hud.weapon];
  const bossDown = isBoss && hud.bossMaxHp > 0 && hud.bossHp <= 0;
  const bossPercent =
    hud.bossMaxHp > 0
      ? Math.max(0, Math.min(100, (hud.bossHp / hud.bossMaxHp) * 100))
      : 0;
  const status =
    hud.wavePhase === 'intermission'
      ? `NEXT ${Math.max(1, Math.ceil(hud.nextWaveIn))}s`
      : `敌人 ${hud.enemiesRemaining}`;
  const waveValue = isBoss
    ? bossDown
      ? 'KO'
      : hud.bossPhase === 2
        ? 'II'
        : 'I'
    : String(hud.wave).padStart(2, '0');

  return (
    <>
      <div className="hud">
        <div className="hud-left">
          <div className={`hp-row ${critical ? 'critical' : ''}`}>
            <span className="hud-label">HULL</span>
            <div className="hp-track">
              <div className="hp-fill" style={{ width: `${hpPercent}%` }} />
              <div className="hp-segments" />
            </div>
            <span className="hp-value">
              {hud.hp}
              <em>/{hud.maxHp}</em>
            </span>
          </div>
          <div className="score-row">
            <span className="hud-label">SCORE</span>
            <strong>{String(hud.score).padStart(6, '0')}</strong>
            {hud.combo >= 2 && (
              <span className="combo-tag" key={hud.combo}>
                x{multiplier.toFixed(1)} <em>{hud.combo} 连杀</em>
              </span>
            )}
          </div>
          <div className="weapon-row">
            <span className="hud-label">WEAPON</span>
            <strong style={{ color: weapon.color }}>{weapon.name}</strong>
            <em>{weapon.tag}</em>
          </div>
        </div>

        <div className={`wave-badge ${isBoss ? 'is-boss' : ''}`}>
          <span className="wave-label">{isBoss ? 'BOSS' : 'WAVE'}</span>
          <strong>{waveValue}</strong>
          <span
            className={`wave-status ${
              isBoss ? 'danger' : hud.wavePhase === 'intermission' ? 'waiting' : ''
            }`}
          >
            {isBoss
              ? bossDown
                ? '目标清除'
                : `PHASE ${hud.bossPhase}`
              : status}
          </span>
        </div>

        <div className="hud-actions">
          <button
            type="button"
            className="icon-button"
            onClick={onMute}
            aria-label={hud.muted ? '打开音效' : '关闭音效'}
            title={hud.muted ? '打开音效' : '关闭音效'}
          >
            {hud.muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onPause}
            aria-label="暂停游戏"
            title="暂停游戏"
          >
            <PauseIcon />
          </button>
        </div>
      </div>

      {isBoss && hud.bossMaxHp > 0 && (
        <div className={`boss-hud ${bossDown ? 'is-down' : ''}`}>
          <div className="boss-hud-head">
            <span className="boss-name">
              <i className="boss-dot" />
              压制核心
            </span>
            <span className="boss-hp-text">
              {hud.bossHp} / {hud.bossMaxHp}
            </span>
          </div>
          <div className="boss-track">
            <div className="boss-fill" style={{ width: `${bossPercent}%` }} />
            <div className="boss-segments" />
          </div>
        </div>
      )}
    </>
  );
}
