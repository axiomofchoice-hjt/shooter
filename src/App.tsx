import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ShooterGame } from './game/Game';
import { INITIAL_HUD, type GameStats, type HudSnapshot } from './game/types';
import { Hud } from './components/Hud';
import { TouchControls } from './components/TouchControls';
import {
  GameOverOverlay,
  PauseOverlay,
  RotateOverlay,
  StartScreen,
} from './components/Overlays';

type Phase = 'menu' | 'playing' | 'paused' | 'gameover';

function detectTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ShooterGame | null>(null);
  const phaseRef = useRef<Phase>('menu');

  const [phase, setPhase] = useState<Phase>('menu');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [victory, setVictory] = useState(false);
  const [isTouch, setIsTouch] = useState(detectTouchDevice);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported] = useState(() => {
    if (typeof document === 'undefined') return false;
    const doc = document as Document & { webkitFullscreenEnabled?: boolean };
    return Boolean(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled);
  });
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(orientation: portrait)').matches;
  });
  const requiresLandscape = isTouch && isPortrait;

  const commitPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new ShooterGame(canvas, {
      onHud: setHud,
      onGameOver: (nextStats, won) => {
        setStats(nextStats);
        setVictory(won);
        commitPhase('gameover');
      },
    });
    gameRef.current = game;
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [commitPhase]);

  const startGame = useCallback(() => {
    if (phaseRef.current === 'playing' || phaseRef.current === 'paused') return;
    setStats(null);
    setVictory(false);
    gameRef.current?.start('survival');
    commitPhase('playing');
  }, [commitPhase]);

  const startBossGame = useCallback(() => {
    if (phaseRef.current === 'playing' || phaseRef.current === 'paused') return;
    setStats(null);
    setVictory(false);
    gameRef.current?.start('boss');
    commitPhase('playing');
  }, [commitPhase]);

  const retryGame = useCallback(() => {
    if (stats?.mode === 'boss') startBossGame();
    else startGame();
  }, [stats, startBossGame, startGame]);

  const resumeGame = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    gameRef.current?.setPaused(false);
    commitPhase('playing');
  }, [commitPhase]);

  const pauseGame = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    gameRef.current?.setPaused(true);
    commitPhase('paused');
  }, [commitPhase]);

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'playing') pauseGame();
    else if (phaseRef.current === 'paused') resumeGame();
  }, [pauseGame, resumeGame]);

  const returnToMenu = useCallback(() => {
    gameRef.current?.toMenu();
    setStats(null);
    setVictory(false);
    commitPhase('menu');
  }, [commitPhase]);

  const toggleMute = useCallback(() => {
    gameRef.current?.toggleMute();
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    try {
      if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
        return;
      }
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      else await root.webkitRequestFullscreen?.();
      if (isTouch && screen.orientation?.lock) {
        try {
          await screen.orientation.lock('landscape');
        } catch {
          // Orientation lock is best-effort; some browsers reject it.
        }
      }
    } catch {
      // The browser may deny fullscreen (e.g. it is disabled in an iframe).
    }
  }, [isTouch]);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const onChange = () => {
      setIsFullscreen(Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    onChange();
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const handleTouchMove = useCallback((x: number, y: number) => {
    gameRef.current?.setTouchMove(x, y);
  }, []);

  const handleTouchFire = useCallback((active: boolean) => {
    gameRef.current?.setTouchFire(active);
  }, []);

  const handleTouchSecondary = useCallback(() => {
    gameRef.current?.triggerSecondary();
  }, []);

  const handleTouchDodge = useCallback(() => {
    gameRef.current?.triggerDodge();
  }, []);

  useEffect(() => {
    const updateOrientation = () => {
      setIsPortrait(
        window.matchMedia('(orientation: portrait)').matches ||
          window.innerHeight > window.innerWidth,
      );
    };
    const media = window.matchMedia('(pointer: coarse)');
    const orientationMedia = window.matchMedia('(orientation: portrait)');
    const update = () => {
      setIsTouch(media.matches || navigator.maxTouchPoints > 0);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') setIsTouch(true);
    };
    update();
    updateOrientation();
    media.addEventListener?.('change', update);
    orientationMedia.addEventListener?.('change', updateOrientation);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', updateOrientation);
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => {
      media.removeEventListener?.('change', update);
      orientationMedia.removeEventListener?.('change', updateOrientation);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', updateOrientation);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (requiresLandscape && phaseRef.current === 'playing') {
      pauseGame();
    }
  }, [requiresLandscape, pauseGame]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;

      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)
      ) {
        event.preventDefault();
      }

      if (phaseRef.current === 'playing') {
        game.setKey(event.code, true);
        if (!event.repeat) {
          if (event.code === 'KeyK') {
            event.preventDefault();
            game.triggerSecondary();
          } else if (event.code === 'KeyL') {
            event.preventDefault();
            game.triggerDodge();
          }
        }
      }

      if (event.code === 'KeyP' || event.code === 'Escape') {
        event.preventDefault();
        togglePause();
        return;
      }

      if (event.code === 'KeyB' && phaseRef.current === 'menu') {
        event.preventDefault();
        startBossGame();
        return;
      }

      if (event.code === 'Enter') {
        const onBossButton =
          event.target instanceof Element && event.target.closest('.boss-button');
        if (phaseRef.current === 'menu') {
          if (onBossButton) return;
          event.preventDefault();
          startGame();
        } else if (phaseRef.current === 'gameover') {
          event.preventDefault();
          retryGame();
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      gameRef.current?.setKey(event.code, false);
    };

    const onBlur = () => {
      gameRef.current?.clearInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [retryGame, startBossGame, startGame, togglePause]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && phaseRef.current === 'playing') {
        pauseGame();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pauseGame]);

  return (
    <div className={`app phase-${phase} ${isTouch ? 'is-touch' : 'is-desktop'}`}>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onContextMenu={(event) => event.preventDefault()}
      />
      <div className="scanline-overlay" aria-hidden="true" />

      {(phase === 'playing' || phase === 'paused') && (
        <Hud hud={hud} onPause={pauseGame} onMute={toggleMute} />
      )}

      {phase === 'playing' && isTouch && (
        <TouchControls
          onMove={handleTouchMove}
          onFire={handleTouchFire}
          onSecondary={handleTouchSecondary}
          onDodge={handleTouchDodge}
          secondaryCooldown={hud.secondaryCooldown}
          dodgeCooldown={hud.dodgeCooldown}
        />
      )}

      {phase === 'menu' && (
        <StartScreen
          isTouch={isTouch}
          isFullscreen={isFullscreen}
          fullscreenSupported={fullscreenSupported}
          onToggleFullscreen={toggleFullscreen}
          onStart={startGame}
          onStartBoss={startBossGame}
        />
      )}

      {phase === 'paused' && (
        <PauseOverlay onResume={resumeGame} onMenu={returnToMenu} />
      )}

      {phase === 'gameover' && stats && (
        <GameOverOverlay
          stats={stats}
          victory={victory}
          onRetry={retryGame}
          onMenu={returnToMenu}
        />
      )}

      {requiresLandscape && <RotateOverlay />}
    </div>
  );
}
