import { ENEMY_LABELS, type HudSnapshot } from '../game/types';
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
  const isTest = hud.mode === 'boss';
  const weapon = WEAPONS[hud.weapon];
  const bossDown = isTest && hud.bossMaxHp > 0 && hud.bossHp <= 0;
  const bossPercent =
    hud.bossMaxHp > 0
      ? Math.max(0, Math.min(100, (hud.bossHp / hud.bossMaxHp) * 100))
      : 0;

  const status = (() => {
    if (hud.roomKind === 'start') return '起始房 · 准备';
    if (hud.roomKind === 'portal') {
      return hud.portalActive ? '传送门已激活' : '传送门锁定';
    }
    if (hud.encounterActive) return `敌人 ${hud.enemiesRemaining}`;
    return `已清 ${hud.roomsCleared}/3 · 门已开`;
  })();

  // The meter is colour-coded so a drop is readable at a glance while playing:
  // green down to 55, amber below that, red once it is closer to 30.
  const fpsTone =
    hud.fps > 0 && hud.fps < 30 ? 'is-bad' : hud.fps > 0 && hud.fps < 55 ? 'is-warn' : '';
  const frameMs = hud.fps > 0 ? (1000 / hud.fps).toFixed(1) : null;

  // Test room names what is still alive for the selected enemy types. Keep it
  // compact once several types are mixed in the same wave.
  const testTotal = hud.testRoster.reduce((sum, entry) => sum + entry.count, 0);
  const testStatus =
    testTotal === 0
      ? '下一波准备中'
      : hud.testRoster.length <= 2
        ? hud.testRoster
            .map((entry) => `${ENEMY_LABELS[entry.kind]} ${entry.count}`)
            .join(' · ')
        : `敌人 ${testTotal} · ${ENEMY_LABELS[hud.testRoster[0].kind]} ${hud.testRoster[0].count} 等 ${hud.testRoster.length} 种`;

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

        <div className={`wave-badge ${isTest ? 'is-test' : 'is-dungeon'}`}>
          <span className="wave-label">{isTest ? 'TEST' : 'FLOOR'}</span>
          <strong>
            {isTest
              ? String(hud.wave).padStart(2, '0')
              : String(hud.floor).padStart(2, '0')}
          </strong>
          <span
            className={`wave-status ${
              isTest
                ? hud.enemiesRemaining > 0
                  ? 'danger'
                  : 'waiting'
                : hud.encounterActive
                  ? 'danger'
                  : hud.roomKind === 'portal' && hud.portalActive
                    ? 'waiting'
                    : ''
            }`}
          >
            {isTest ? testStatus : status}
          </span>
          {!isTest && (
            <span className="room-pips" aria-hidden="true">
              {[1, 2, 3].map((room) => (
                <i
                  key={room}
                  className={
                    hud.roomsCleared >= room
                      ? 'done'
                      : hud.room === room && hud.encounterActive
                        ? 'active'
                        : hud.room === room
                          ? 'current'
                          : ''
                  }
                />
              ))}
            </span>
          )}
        </div>

        <div className="hud-right">
          <div className="hud-actions">
            <button
              type="button"
              tabIndex={-1}
              className="icon-button"
              onClick={onMute}
              aria-label={hud.muted ? '打开音效' : '关闭音效'}
              title={hud.muted ? '打开音效' : '关闭音效'}
            >
              {hud.muted ? <SoundOffIcon /> : <SoundOnIcon />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="icon-button"
              onClick={onPause}
              aria-label="暂停游戏"
              title="暂停游戏"
            >
              <PauseIcon />
            </button>
          </div>
          <span
            className={`fps-meter ${fpsTone}`}
            title={frameMs ? `约 ${frameMs} ms/帧` : '帧率采样中'}
          >
            <span className="fps-value">{hud.fps > 0 ? hud.fps : '--'}</span>
            <span className="fps-unit">FPS</span>
          </span>
        </div>
      </div>

      {isTest && hud.bossMaxHp > 0 && (
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
