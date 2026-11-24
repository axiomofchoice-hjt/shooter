import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BurstIcon, DashIcon } from './Icons';

interface TouchControlsProps {
  onMove: (x: number, y: number) => void;
  onFire: (active: boolean) => void;
  onSecondary: () => void;
  onDodge: () => void;
  secondaryCooldown: number;
  dodgeCooldown: number;
}

// 视觉圆盘（.joystick-base）半径是 pad 宽度的 0.42 倍；
// 触摸感应半径是它的 2 倍（由 CSS 的 --joy-touch 决定），这里只控制旋钮能拉多远。
const MAX_KNOB_RATIO = 0.26;

export function TouchControls({
  onMove,
  onFire,
  onSecondary,
  onDodge,
  secondaryCooldown,
  dodgeCooldown,
}: TouchControlsProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  // Geometry is cached on touch-down: measuring the pad on every pointermove
  // forced a layout read per event, and moving the knob through React state
  // re-rendered the whole control cluster at the pointer rate (~120Hz), which
  // added input lag exactly when dodging needs to feel instant.
  const stickGeom = useRef({ centerX: 0, centerY: 0, max: 0 });
  const firePointer = useRef<number | null>(null);
  const [stickActive, setStickActive] = useState(false);
  const [fireActive, setFireActive] = useState(false);

  useEffect(() => {
    return () => {
      onMove(0, 0);
      onFire(false);
    };
  }, [onMove, onFire]);

  const moveKnob = (x: number, y: number) => {
    const knob = knobRef.current;
    if (knob) {
      knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }
  };

  const updateStick = (clientX: number, clientY: number) => {
    const { centerX, centerY, max } = stickGeom.current;
    if (max <= 0) return;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const length = Math.hypot(dx, dy);
    if (length > max) {
      dx = (dx / length) * max;
      dy = (dy / length) * max;
    }
    moveKnob(dx, dy);
    onMove(dx / max, dy / max);
  };

  const endStick = (pointerId?: number) => {
    if (pointerId !== undefined && stickPointer.current !== pointerId) return;
    stickPointer.current = null;
    setStickActive(false);
    moveKnob(0, 0);
    onMove(0, 0);
  };

  const endFire = (pointerId?: number) => {
    if (pointerId !== undefined && firePointer.current !== pointerId) return;
    firePointer.current = null;
    setFireActive(false);
    onFire(false);
  };

  return (
    <div className="touch-ui" aria-hidden="true">
      <div
        ref={padRef}
        className={`joystick-pad ${stickActive ? 'is-active' : ''}`}
        onPointerDown={(event) => {
          if (stickPointer.current !== null) return;
          stickPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          const rect = event.currentTarget.getBoundingClientRect();
          stickGeom.current = {
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
            max: rect.width * MAX_KNOB_RATIO,
          };
          setStickActive(true);
          updateStick(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (stickPointer.current !== event.pointerId) return;
          updateStick(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => endStick(event.pointerId)}
        onPointerCancel={(event) => endStick(event.pointerId)}
        onLostPointerCapture={(event) => endStick(event.pointerId)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="joystick-base">
          <span className="joystick-tick tick-n" />
          <span className="joystick-tick tick-e" />
          <span className="joystick-tick tick-s" />
          <span className="joystick-tick tick-w" />
          <span className="joystick-ring" />
        </div>
        <div ref={knobRef} className="joystick-knob">
          <span />
        </div>
        <div className="joystick-label">MOVE</div>
      </div>

      <div className="fire-zone">
        <button
          type="button"
          tabIndex={-1}
          className={`fire-button ${fireActive ? 'is-active' : ''}`}
          onPointerDown={(event) => {
            event.preventDefault();
            if (firePointer.current !== null) return;
            firePointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            setFireActive(true);
            onFire(true);
            if ('vibrate' in navigator) navigator.vibrate(8);
          }}
          onPointerUp={(event) => endFire(event.pointerId)}
          onPointerCancel={(event) => endFire(event.pointerId)}
          onLostPointerCapture={(event) => endFire(event.pointerId)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <span className="fire-crosshair">
            <span />
          </span>
          <span className="fire-label">FIRE</span>
          <span className="fire-sub">按住连射</span>
        </button>
      </div>

      <button
        type="button"
        tabIndex={-1}
        className={`ability-button ability-secondary ${
          secondaryCooldown > 0 ? 'is-cooling' : ''
        }`}
        style={{ '--cool': `${secondaryCooldown * 100}%` } as CSSProperties}
        aria-label="副武器：散射炮"
        title="副武器：散射炮"
        onPointerDown={(event) => {
          event.preventDefault();
          if (secondaryCooldown > 0) return;
          onSecondary();
          if ('vibrate' in navigator) navigator.vibrate(12);
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="ability-icon">
          <BurstIcon />
        </span>
        <span className="ability-label">副武器</span>
        <span className="ability-cool" aria-hidden="true" />
      </button>

      <button
        type="button"
        tabIndex={-1}
        className={`ability-button ability-dodge ${dodgeCooldown > 0 ? 'is-cooling' : ''}`}
        style={{ '--cool': `${dodgeCooldown * 100}%` } as CSSProperties}
        aria-label="闪避：沿移动方向冲刺"
        title="闪避：沿移动方向冲刺"
        onPointerDown={(event) => {
          event.preventDefault();
          if (dodgeCooldown > 0) return;
          onDodge();
          if ('vibrate' in navigator) navigator.vibrate(9);
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="ability-icon">
          <DashIcon />
        </span>
        <span className="ability-label">闪避</span>
        <span className="ability-cool" aria-hidden="true" />
      </button>
    </div>
  );
}
