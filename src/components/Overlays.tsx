import type { CSSProperties } from 'react';
import type {
  ArmorId,
  GameStats,
  TestEnemyKind,
  TestRoomConfig,
  WeaponId,
} from '../game/types';
import { ENEMY_LABELS, TEST_ENEMY_KINDS } from '../game/types';
import { ALL_ARMORS, ARMORS } from '../game/armors';
import { ALL_WEAPONS, WEAPONS } from '../game/weapons';
import {
  ArrowIcon,
  BossIcon,
  CrosshairIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  KeyboardIcon,
  PlayIcon,
  TestIcon,
  TouchIcon,
} from './Icons';

interface StartScreenProps {
  isTouch: boolean;
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  testWeaponCount: number;
  testEnemyCount: number;
  onToggleFullscreen: () => void;
  onStart: () => void;
  onOpenTest: () => void;
  onStartBoss: () => void;
}

export function StartScreen({
  isTouch,
  isFullscreen,
  fullscreenSupported,
  testWeaponCount,
  testEnemyCount,
  onToggleFullscreen,
  onStart,
  onOpenTest,
  onStartBoss,
}: StartScreenProps) {
  return (
    <div className="overlay menu-overlay">
      <div className="menu-glow menu-glow-a" />
      <div className="menu-glow menu-glow-b" />
      <main className="menu-panel">
        <div className="menu-topline">
          <span className="eyebrow">
            <i className="status-dot" />
            SHOOTER / PROTOTYPE 01
          </span>
          <div className="menu-topline-right">
            <span className="build-tag">CANVAS 2D · 双端适配</span>
            {fullscreenSupported && (
              <button
                type="button"
                tabIndex={-1}
                className="fullscreen-button"
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
                title={isFullscreen ? '退出全屏' : '进入全屏'}
              >
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                <span>{isFullscreen ? '退出全屏' : '全屏'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="menu-content">
          <section className="hero-copy">
            <p className="hero-kicker">地牢 · 房间推进</p>
            <h1 className="menu-title">SHOOTER</h1>
            <p className="hero-lead">
              禁区信号失控。从起始房出发，清空三个战斗房，踏入最右侧的传送门继续下潜；
              也可以直接进入 BOSS 房单挑压制核心。
            </p>

            <button
              type="button"
              tabIndex={-1}
              className="start-button"
              onClick={onStart}
            >
              <span className="start-button-icon">
                <PlayIcon />
              </span>
              <span className="start-button-copy">
                <strong>进入地牢</strong>
                <small>START RUN</small>
              </span>
              <span className="start-button-key">
                {isTouch ? 'TAP' : 'ENTER'}
                <ArrowIcon />
              </span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              className="mode-button test-button"
              onClick={onOpenTest}
              title="测试房设置（选择武器与敌人）"
            >
              <span className="mode-button-icon">
                <TestIcon />
              </span>
              <span className="mode-button-copy">
                <strong>进入测试房</strong>
                <small>
                  TEST ROOM · 已选 {testWeaponCount} 把武器 / {testEnemyCount} 种敌人
                </small>
              </span>
              <span className="mode-button-key">
                {isTouch ? 'TAP' : 'T'}
                <ArrowIcon />
              </span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              className="mode-button boss-button"
              onClick={onStartBoss}
              title="直接进入 BOSS 房，单挑压制核心"
            >
              <span className="mode-button-icon">
                <BossIcon />
              </span>
              <span className="mode-button-copy">
                <strong>进入 BOSS 房</strong>
                <small>BOSS ARENA · 单房间决战</small>
              </span>
              <span className="mode-button-key">
                {isTouch ? 'TAP' : 'B'}
                <ArrowIcon />
              </span>
            </button>

            <p className="hero-note">
              <CrosshairIcon />
              清空房间 · 闸门开启 · 传送门下层
            </p>
          </section>

          <aside className="controls-stack" aria-label="操作说明">
            <article className={`control-card ${!isTouch ? 'is-current' : ''}`}>
              <header>
                <span className="control-icon">
                  <KeyboardIcon />
                </span>
                <div>
                  <h2>键盘操作</h2>
                  <p>DESKTOP</p>
                </div>
                {!isTouch && <span className="control-current">当前</span>}
              </header>
              <div className="control-row">
                <span>移动</span>
                <div className="key-group">
                  <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd>
                </div>
              </div>
              <div className="control-row">
                <span>瞄准</span>
                <span className="virtual-key">自动锁定</span>
                <em>最近敌人</em>
              </div>
              <div className="control-row">
                <span>开火</span>
                <kbd className="key-wide accent">J</kbd>
                <em>按住连射</em>
              </div>
              <div className="control-row">
                <span>闪避</span>
                <kbd className="key-wide">L</kbd>
                <em>朝移动方向冲刺</em>
              </div>
              <div className="control-row">
                <span>换武器</span>
                <kbd className="key-wide">TAB</kbd>
                <em>Shift 反向</em>
              </div>
            </article>

            <article className={`control-card mobile-card ${isTouch ? 'is-current' : ''}`}>
              <header>
                <span className="control-icon">
                  <TouchIcon />
                </span>
                <div>
                  <h2>触屏操作</h2>
                  <p>MOBILE</p>
                </div>
                {isTouch && <span className="control-current">当前</span>}
              </header>
              <div className="control-row">
                <span>移动</span>
                <span className="virtual-key">左摇杆</span>
                <em>全向移动</em>
              </div>
              <div className="control-row">
                <span>开火</span>
                <span className="virtual-key accent">右侧按钮</span>
                <em>按住连射</em>
              </div>
              <div className="control-row">
                <span>瞄准</span>
                <span className="virtual-key">自动锁定</span>
                <em>最近敌人</em>
              </div>
              <div className="control-row">
                <span>换武器</span>
                <span className="virtual-key">右上按钮</span>
                <em>点按切换</em>
              </div>
              <div className="control-row">
                <span>闪避</span>
                <span className="virtual-key">右下按钮</span>
                <em>沿移动方向</em>
              </div>
            </article>

            <div className="feature-tags">
              <span>地牢楼层</span>
              <span>3 个战斗房</span>
              <span>BOSS 房</span>
            </div>
          </aside>
        </div>

        <footer className="menu-footer">
          <span>SECTOR 07 · SIGNAL LOST</span>
          <span>WASD 移动 &nbsp;·&nbsp; J 开火 &nbsp;·&nbsp; L 闪避 &nbsp;·&nbsp; TAB 换武器 &nbsp;·&nbsp; T 测试房 &nbsp;·&nbsp; B BOSS 房</span>
        </footer>
      </main>
    </div>
  );
}

interface TestRoomSetupProps {
  config: TestRoomConfig;
  onToggleWeapon: (id: WeaponId) => void;
  onToggleEnemy: (kind: TestEnemyKind) => void;
  onSelectArmor: (id: ArmorId) => void;
  onStart: () => void;
  onClose: () => void;
}

export function TestRoomSetup({
  config,
  onToggleWeapon,
  onToggleEnemy,
  onSelectArmor,
  onStart,
  onClose,
}: TestRoomSetupProps) {
  return (
    <div className="overlay modal-overlay setup-overlay">
      <section
        className="modal-panel setup-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
      >
        <span className="modal-eyebrow">TEST ROOM · LOADOUT</span>
        <h2 id="setup-title" className="modal-title">
          测试房设置
        </h2>
        <p className="modal-copy">
          勾选要带进测试房的武器和要刷新的敌人；清空一波后 1.6 秒自动续波。
          所有武器都在这里，勾上就会带进去；装甲只有一个槽位，只能选一件。
        </p>

        <div className="setup-group">
          <div className="setup-group-head">
            <h3>
              武器 <span>{config.weapons.length} / {ALL_WEAPONS.length}</span>
            </h3>
            <span>进入后按武器按钮、TAB 或 LB / RB 切换</span>
          </div>
          <div className="setup-chips">
            {ALL_WEAPONS.map((id) => {
              const spec = WEAPONS[id];
              const selected = config.weapons.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  className={`setup-chip ${selected ? 'is-on' : ''}`}
                  style={{ '--chip-color': spec.color } as CSSProperties}
                  onClick={() => onToggleWeapon(id)}
                >
                  <span className="setup-chip-copy">
                    <strong>{spec.name}</strong>
                    <em>{spec.tag}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="setup-group">
          <div className="setup-group-head">
            <h3>装甲 <span>1 件</span></h3>
            <span>单选 · 同一时间只能装备一件</span>
          </div>
          <div className="setup-chips">
            {ALL_ARMORS.map((id) => {
              const spec = ARMORS[id];
              const selected = (config.armor ?? 'shield') === id;
              return (
                <button
                  key={id}
                  type="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  className={`setup-chip ${selected ? 'is-on' : ''}`}
                  style={{ '--chip-color': spec.color } as CSSProperties}
                  onClick={() => onSelectArmor(id)}
                >
                  <span className="setup-chip-copy">
                    <strong>{spec.name}</strong>
                    <em>{spec.tag}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="setup-group">
          <div className="setup-group-head">
            <h3>
              敌人 <span>{config.enemies.length} / {TEST_ENEMY_KINDS.length}</span>
            </h3>
            <span>每波按勾选顺序轮换出场</span>
          </div>
          <div className="setup-chips">
            {TEST_ENEMY_KINDS.map((kind) => {
              const selected = config.enemies.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  className={`setup-chip setup-chip-enemy ${selected ? 'is-on' : ''}`}
                  onClick={() => onToggleEnemy(kind)}
                >
                  <span className="setup-chip-copy">
                    <strong>{ENEMY_LABELS[kind]}</strong>
                    <em>{kind.toUpperCase()}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="modal-actions row-actions">
          <button
            type="button"
            tabIndex={-1}
            className="primary-button"
            onClick={onStart}
            disabled={config.weapons.length === 0 || config.enemies.length === 0}
          >
            <PlayIcon />
            开始测试
          </button>
          <button type="button" tabIndex={-1} className="ghost-button" onClick={onClose}>
            返回主界面
          </button>
        </div>
        <span className="modal-hint">
          Enter / B 开始 · Esc 返回 · 手柄 A 开始 / B 返回 · 至少各选一项
        </span>
      </section>
    </div>
  );
}

interface PauseOverlayProps {
  onResume: () => void;
  onMenu: () => void;
}

export function PauseOverlay({ onResume, onMenu }: PauseOverlayProps) {
  return (
    <div className="overlay modal-overlay">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <span className="modal-eyebrow">SYSTEM HOLD</span>
        <h2 id="pause-title" className="modal-title">
          暂停
        </h2>
        <p className="modal-copy">战斗已冻结。喘口气，然后继续。</p>
        <div className="modal-actions">
          <button
            type="button"
            tabIndex={-1}
            className="primary-button"
            onClick={onResume}
          >
            <PlayIcon />
            继续战斗
          </button>
          <button type="button" tabIndex={-1} className="ghost-button" onClick={onMenu}>
            返回主界面
          </button>
        </div>
        <span className="modal-hint">点击继续 · 按 P / ESC 也可恢复</span>
      </section>
    </div>
  );
}

interface GameOverOverlayProps {
  stats: GameStats;
  victory: boolean;
  onRetry: () => void;
  onMenu: () => void;
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function GameOverOverlay({
  stats,
  victory,
  onRetry,
  onMenu,
}: GameOverOverlayProps) {
  const rank =
    stats.score >= 5000
      ? 'S'
      : stats.score >= 2500
        ? 'A'
        : stats.score >= 1200
          ? 'B'
          : stats.score >= 500
            ? 'C'
            : 'D';
  const isTest = stats.mode === 'test';
  const isBoss = stats.mode === 'boss';
  const eyebrow = victory
    ? 'THREAT NEUTRALIZED'
    : isTest
      ? 'TEST RUN OVER'
      : isBoss
        ? 'THREAT PERSISTS'
        : 'RUN TERMINATED';
  const title = victory
    ? 'BOSS 已击破'
    : isTest
      ? '测试结束'
      : isBoss
        ? '挑战失败'
        : '探索终止';
  const copy = victory
    ? '压制核心沉默，小房间里的威胁暂时清空。'
    : isTest
      ? `你倒在第 ${stats.wave} 波。追踪弹只在锁定期内咬人，锁一松就只走直线。`
      : isBoss
        ? '压制核心仍在运转。看清前摇，绕着它的弹幕再试一次。'
        : `你倒在了第 ${stats.floor} 层，传送门还在更深处。`;

  return (
    <div className={`overlay modal-overlay ${victory ? 'is-victory' : ''}`}>
      <section className="modal-panel game-over-panel" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
        <div className="game-over-head">
          <span className={`modal-eyebrow ${victory ? 'success' : 'danger'}`}>{eyebrow}</span>
          {victory ? (
            <span className="rank-badge rank-clear">CLEAR</span>
          ) : (
            <span className={`rank-badge rank-${rank}`}>RANK {rank}</span>
          )}
        </div>
        <h2 id="gameover-title" className="modal-title">
          {title}
        </h2>
        <p className="modal-copy">{copy}</p>

        <div className="stats-grid">
          <div className="stat-block stat-main">
            <span>最终得分</span>
            <strong>{String(stats.score).padStart(6, '0')}</strong>
          </div>
          <div className="stat-block">
            <span>{isTest ? '测试波次' : isBoss ? '挑战目标' : '抵达楼层'}</span>
            <strong>
              {isTest
                ? `WAVE ${String(stats.wave).padStart(2, '0')}`
                : isBoss
                  ? 'BOSS'
                  : `FLOOR ${String(stats.floor).padStart(2, '0')}`}
            </strong>
          </div>
          <div className="stat-block">
            <span>击杀</span>
            <strong>{stats.kills}</strong>
          </div>
          <div className="stat-block">
            <span>存活时间</span>
            <strong>{formatTime(stats.time)}</strong>
          </div>
        </div>

        <div className="modal-actions row-actions">
          <button
            type="button"
            tabIndex={-1}
            className="primary-button"
            onClick={onRetry}
          >
            <PlayIcon />
            {isTest ? '再来一轮' : isBoss ? '再战 BOSS' : '再次下潜'}
          </button>
          <button type="button" tabIndex={-1} className="ghost-button" onClick={onMenu}>
            返回主界面
          </button>
        </div>
      </section>
    </div>
  );
}

export function RotateOverlay() {
  return (
    <div className="rotate-overlay" role="alertdialog" aria-modal="true" aria-labelledby="rotate-title">
      <div className="rotate-panel">
        <p className="rotate-eyebrow">
          <span className="status-dot" />
          LANDSCAPE REQUIRED
        </p>
        <div className="rotate-graphic" aria-hidden="true">
          <svg viewBox="0 0 160 140" fill="none">
            <circle cx="80" cy="70" r="53" stroke="rgba(95, 246, 255, 0.16)" strokeDasharray="3 9" />
            <rect x="62" y="26" width="36" height="66" rx="8" stroke="#5ff6ff" strokeWidth="1.6" />
            <rect x="72" y="32" width="16" height="2" rx="1" fill="rgba(95, 246, 255, 0.6)" />
            <circle cx="80" cy="83" r="2" fill="#5ff6ff" />
            <path
              d="M31 95a53 53 0 0 1 18-69"
              stroke="rgba(95, 246, 255, 0.7)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="m43 21 10 6-10 7"
              stroke="#5ff6ff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M129 45a53 53 0 0 1-18 69"
              stroke="rgba(255, 77, 125, 0.45)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="3 6"
            />
          </svg>
        </div>
        <h2 id="rotate-title" className="rotate-title">
          请旋转至横屏
        </h2>
        <p className="rotate-copy">
          把手机横过来，获得完整的左侧摇杆和右侧开火、技能区域。
        </p>
        <div className="rotate-controls">
          <span>左摇杆移动</span>
          <span>右侧开火</span>
          <span>自动锁定</span>
        </div>
        <p className="rotate-hint">横屏后点击继续</p>
      </div>
    </div>
  );
}
