import type { HudSnapshot } from '../game/types';
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
  const status =
    hud.wavePhase === 'intermission'
      ? `NEXT ${Math.max(1, Math.ceil(hud.nextWaveIn))}s`
      : `敌人 ${hud.enemiesRemaining}`;

  return (
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
      </div>

      <div className="wave-badge">
        <span className="wave-label">WAVE</span>
        <strong>{String(hud.wave).padStart(2, '0')}</strong>
        <span className={`wave-status ${hud.wavePhase === 'intermission' ? 'waiting' : ''}`}>
          {status}
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
  );
}
