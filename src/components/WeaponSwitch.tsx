import type { CSSProperties } from 'react';
import type { WeaponId } from '../game/types';
import { WEAPONS } from '../game/weapons';

interface WeaponSwitchProps {
  weapon: WeaponId;
  onCycle: () => void;
  /** Touch layout: the panel only reports the current weapon; the round
   * button next to FIRE does the switching. */
  readOnly?: boolean;
}

export function WeaponSwitch({ weapon, onCycle, readOnly = false }: WeaponSwitchProps) {
  const spec = WEAPONS[weapon];
  const style = { '--weapon-color': spec.color } as CSSProperties;

  if (readOnly) {
    return (
      <div
        className="weapon-switch is-static"
        style={style}
        role="status"
        aria-label={`当前武器 ${spec.name}`}
      >
        <span className="weapon-switch-tag">武器 · {spec.tag}</span>
        <strong>{spec.name}</strong>
        <span className="weapon-switch-hint">右侧按钮换枪</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      tabIndex={-1}
      className="weapon-switch"
      style={style}
      onClick={onCycle}
      title={`切换武器（当前：${spec.name}）`}
      aria-label={`切换武器，当前 ${spec.name}`}
    >
      <span className="weapon-switch-tag">武器 · {spec.tag}</span>
      <strong>{spec.name}</strong>
      <span className="weapon-switch-hint">TAB / 点按切换</span>
    </button>
  );
}
