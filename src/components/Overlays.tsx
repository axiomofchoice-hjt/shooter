import type { GameStats } from '../game/types';
import {
  ArrowIcon,
  CrosshairIcon,
  KeyboardIcon,
  PlayIcon,
  TouchIcon,
} from './Icons';

interface StartScreenProps {
  isTouch: boolean;
  onStart: () => void;
}

export function StartScreen({ isTouch, onStart }: StartScreenProps) {
  return (
    <div className="overlay menu-overlay">
      <div className="menu-glow menu-glow-a" />
      <div className="menu-glow menu-glow-b" />
      <main className="menu-panel">
        <div className="menu-topline">
          <span className="eyebrow">
            <i className="status-dot" />
            NEON RIFT / PROTOTYPE 01
          </span>
          <span className="build-tag">CANVAS 2D · 双端适配</span>
        </div>

        <div className="menu-content">
          <section className="hero-copy">
            <p className="hero-kicker">俯视角 · 生存射击</p>
            <h1 className="menu-title">
              NEON <em>RIFT</em>
            </h1>
            <p className="menu-cn">霓虹裂隙</p>
            <p className="hero-lead">
              禁区信号失控。锁定最近的敌人，在无尽波次里活下来。
            </p>

            <button type="button" className="start-button" onClick={onStart} autoFocus>
              <span className="start-button-icon">
                <PlayIcon />
              </span>
              <span className="start-button-copy">
                <strong>开始战斗</strong>
                <small>ENTER THE RIFT</small>
              </span>
              <span className="start-button-key">
                {isTouch ? 'TAP' : 'ENTER'}
                <ArrowIcon />
              </span>
            </button>

            <p className="hero-note">
              <CrosshairIcon />
              按住开火 · 自动锁定 · 每波结束修复装甲
            </p>
          </section>

          <aside className="controls-stack" aria-label="操作说明">
            <article className={`control-card ${!isTouch ? 'is-current' : ''}`}>
              <header>
                <span className="control-icon">
                  <KeyboardIcon />
                </span>
                <div>
                  <h2>键鼠操作</h2>
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
                <kbd className="key-wide">鼠标移动</kbd>
              </div>
              <div className="control-row">
                <span>开火</span>
                <kbd className="key-wide accent">J</kbd>
                <em>按住连射</em>
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
            </article>

            <div className="feature-tags">
              <span>无限波次</span>
              <span>4 种敌人</span>
              <span>霓虹视效</span>
            </div>
          </aside>
        </div>

        <footer className="menu-footer">
          <span>SECTOR 07 · SIGNAL LOST</span>
          <span>WASD / 左摇杆移动 &nbsp;·&nbsp; J / 右侧按钮开火</span>
        </footer>
      </main>
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
          <button type="button" className="primary-button" onClick={onResume} autoFocus>
            <PlayIcon />
            继续战斗
          </button>
          <button type="button" className="ghost-button" onClick={onMenu}>
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
  onRetry: () => void;
  onMenu: () => void;
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function GameOverOverlay({ stats, onRetry, onMenu }: GameOverOverlayProps) {
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

  return (
    <div className="overlay modal-overlay">
      <section className="modal-panel game-over-panel" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
        <div className="game-over-head">
          <span className="modal-eyebrow danger">SIGNAL LOST</span>
          <span className={`rank-badge rank-${rank}`}>RANK {rank}</span>
        </div>
        <h2 id="gameover-title" className="modal-title">
          信号中断
        </h2>
        <p className="modal-copy">你被敌对信号淹没了。还能再撑一波吗？</p>

        <div className="stats-grid">
          <div className="stat-block stat-main">
            <span>最终得分</span>
            <strong>{String(stats.score).padStart(6, '0')}</strong>
          </div>
          <div className="stat-block">
            <span>抵达波次</span>
            <strong>{String(stats.wave).padStart(2, '0')}</strong>
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
          <button type="button" className="primary-button" onClick={onRetry} autoFocus>
            <PlayIcon />
            再来一局
          </button>
          <button type="button" className="ghost-button" onClick={onMenu}>
            返回主界面
          </button>
        </div>
      </section>
    </div>
  );
}
