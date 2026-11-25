import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ShooterGame } from './game/Game';
import { createGamepadPoller, PAD_BUTTON } from './game/gamepad';
import {
  TEST_ENEMY_KINDS,
  INITIAL_HUD,
  type GameStats,
  type HudSnapshot,
  type TestEnemyKind,
  type TestRoomConfig,
  type WeaponId,
} from './game/types';
import { Hud } from './components/Hud';
import { TouchControls } from './components/TouchControls';
import { WeaponSwitch } from './components/WeaponSwitch';
import { ALL_WEAPONS } from './game/weapons';
import {
  GameOverOverlay,
  PauseOverlay,
  RotateOverlay,
  StartScreen,
  TestRoomSetup,
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
  // One poller for the whole session so button edges survive re-renders.
  const [gamepad] = useState(createGamepadPoller);

  const [phase, setPhase] = useState<Phase>('menu');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [victory, setVictory] = useState(false);
  const [isTouch, setIsTouch] = useState(detectTouchDevice);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The test room opens with just the pulse rifle checked; every weapon is
  // listed and can be checked, so this is a selection, not a hidden state.
  const [testConfig, setTestConfig] = useState<TestRoomConfig>(() => ({
    weapons: ['pulse'],
    enemies: ['grunt'],
  }));
  const [testSetupOpen, setTestSetupOpen] = useState(false);
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
    setTestSetupOpen(false);
    gameRef.current?.start('dungeon');
    commitPhase('playing');
  }, [commitPhase]);

  const startBossGame = useCallback(() => {
    if (phaseRef.current === 'playing' || phaseRef.current === 'paused') return;
    setStats(null);
    setVictory(false);
    setTestSetupOpen(false);
    gameRef.current?.start('boss', testConfig);
    commitPhase('playing');
  }, [commitPhase, testConfig]);

  const openTestSetup = useCallback(() => {
    if (phaseRef.current !== 'menu') return;
    setTestSetupOpen(true);
  }, []);

  const closeTestSetup = useCallback(() => {
    setTestSetupOpen(false);
  }, []);

  const toggleTestWeapon = useCallback((id: WeaponId) => {
    setTestConfig((prev) => {
      if (prev.weapons.includes(id)) {
        // Keep at least one gun in the loadout.
        if (prev.weapons.length === 1) return prev;
        return { ...prev, weapons: prev.weapons.filter((weapon) => weapon !== id) };
      }
      return {
        ...prev,
        // Store in canonical order so the starting gun and the cycle are stable.
        weapons: ALL_WEAPONS.filter(
          (weapon) => weapon === id || prev.weapons.includes(weapon),
        ),
      };
    });
  }, []);

  const toggleTestEnemy = useCallback((kind: TestEnemyKind) => {
    setTestConfig((prev) => {
      if (prev.enemies.includes(kind)) {
        if (prev.enemies.length === 1) return prev;
        return { ...prev, enemies: prev.enemies.filter((enemy) => enemy !== kind) };
      }
      return {
        ...prev,
        enemies: TEST_ENEMY_KINDS.filter(
          (enemy) => enemy === kind || prev.enemies.includes(enemy),
        ),
      };
    });
  }, []);

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

  const cycleWeapon = useCallback(() => {
    gameRef.current?.cycleWeapon();
  }, []);

  useEffect(() => {
    // Buttons are game controls, not form fields: a click should not leave one
    // focused, or the next Enter/Space would re-trigger it. Keyboard play goes
    // through the global hotkeys instead (Enter / B / P / Esc).
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button');
      if (button) button.blur();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
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

      if (testSetupOpen) {
        if (event.code === 'Escape') {
          event.preventDefault();
          closeTestSetup();
          return;
        }
        if (event.code === 'Enter' || event.code === 'KeyB') {
          // A focused chip handles Enter itself; everything else confirms.
          const onControl =
            event.target instanceof Element && event.target.closest('button');
          if (!onControl) {
            event.preventDefault();
            startBossGame();
          }
          return;
        }
      }

      if (event.code === 'KeyP' || event.code === 'Escape') {
        event.preventDefault();
        togglePause();
        return;
      }

      if (event.code === 'KeyB' && phaseRef.current === 'menu') {
        event.preventDefault();
        openTestSetup();
        return;
      }

      if (event.code === 'Enter') {
        if (phaseRef.current === 'menu') {
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
  }, [closeTestSetup, openTestSetup, retryGame, startBossGame, startGame, testSetupOpen, togglePause]);

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const pad = gamepad.poll();
      const game = gameRef.current;
      const phase = phaseRef.current;

      if (game) {
        if (phase === 'playing') {
          game.setGamepadMove(pad.moveX, pad.moveY);
          game.setGamepadFire(pad.fire);
          if (pad.pressed.has(PAD_BUTTON.dodge)) game.triggerDodge();
          if (pad.pressed.has(PAD_BUTTON.secondary)) game.triggerSecondary();
          if (pad.pressed.has(PAD_BUTTON.weaponPrev)) game.cycleWeapon(-1);
          if (pad.pressed.has(PAD_BUTTON.weaponNext)) game.cycleWeapon();
        } else {
          // Holding buttons through a menu transition must not leak into play.
          game.setGamepadMove(0, 0);
          game.setGamepadFire(false);
        }
      }

      if (testSetupOpen) {
        // The loadout picker is a confirm dialog: A / Start starts the test
        // room with the saved config, B backs out.
        if (pad.pressed.has(PAD_BUTTON.back)) closeTestSetup();
        else if (
          pad.pressed.has(PAD_BUTTON.pause) ||
          pad.pressed.has(PAD_BUTTON.dodge)
        ) {
          startBossGame();
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      if (pad.pressed.has(PAD_BUTTON.pause)) {
        if (phase === 'menu') startGame();
        else if (phase === 'gameover') retryGame();
        else togglePause();
      }
      if (pad.pressed.has(PAD_BUTTON.dodge)) {
        if (phase === 'menu') startGame();
        else if (phase === 'paused') resumeGame();
        else if (phase === 'gameover') retryGame();
      }
      if (pad.pressed.has(PAD_BUTTON.back)) {
        if (phase === 'menu') openTestSetup();
        else if (phase === 'paused' || phase === 'gameover') returnToMenu();
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    closeTestSetup,
    openTestSetup,
    retryGame,
    resumeGame,
    returnToMenu,
    startBossGame,
    startGame,
    testSetupOpen,
    togglePause,
  ]);

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
      <div className="vignette-overlay" aria-hidden="true" />
      <div className="scanline-overlay" aria-hidden="true" />

      {(phase === 'playing' || phase === 'paused') && (
        <Hud hud={hud} onPause={pauseGame} onMute={toggleMute} />
      )}

      {phase === 'playing' && hud.weaponCount > 1 && (
        <WeaponSwitch weapon={hud.weapon} onCycle={cycleWeapon} />
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
          testWeaponCount={testConfig.weapons.length}
          testEnemyCount={testConfig.enemies.length}
          onToggleFullscreen={toggleFullscreen}
          onStart={startGame}
          onOpenTest={openTestSetup}
        />
      )}

      {phase === 'menu' && testSetupOpen && (
        <TestRoomSetup
          config={testConfig}
          onToggleWeapon={toggleTestWeapon}
          onToggleEnemy={toggleTestEnemy}
          onStart={startBossGame}
          onClose={closeTestSetup}
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
