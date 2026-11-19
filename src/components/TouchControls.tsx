import { useEffect, useRef, useState } from 'react';

interface TouchControlsProps {
  onMove: (x: number, y: number) => void;
  onFire: (active: boolean) => void;
}

const MAX_KNOB_RATIO = 0.31;

export function TouchControls({ onMove, onFire }: TouchControlsProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const firePointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [stickActive, setStickActive] = useState(false);
  const [fireActive, setFireActive] = useState(false);

  useEffect(() => {
    return () => {
      onMove(0, 0);
      onFire(false);
    };
  }, [onMove, onFire]);

  const updateStick = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const max = rect.width * MAX_KNOB_RATIO;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const length = Math.hypot(dx, dy);
    if (length > max) {
      dx = (dx / length) * max;
      dy = (dy / length) * max;
    }
    setKnob({ x: dx, y: dy });
    onMove(dx / max, dy / max);
  };

  const endStick = (pointerId?: number) => {
    if (pointerId !== undefined && stickPointer.current !== pointerId) return;
    stickPointer.current = null;
    setStickActive(false);
    setKnob({ x: 0, y: 0 });
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
        <div
          className="joystick-knob"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        >
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
    </div>
  );
}
