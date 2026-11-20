import type { CSSProperties } from 'react';
import type { WeaponId } from '../game/types';
import { WEAPONS } from '../game/weapons';

interface WeaponSwitchProps {
  weapon: WeaponId;
  onCycle: () => void;
}

export function WeaponSwitch({ weapon, onCycle }: WeaponSwitchProps) {
  const spec = WEAPONS[weapon];
  return (
    <button
      type="button"
      className="weapon-switch"
      style={{ '--weapon-color': spec.color } as CSSProperties}
      onClick={onCycle}
      title={`切换武器（当前：${spec.name}）`}
      aria-label={`切换武器，当前 ${spec.name}`}
    >
      <span className="weapon-switch-tag">武器 · {spec.tag}</span>
      <strong>{spec.name}</strong>
      <span className="weapon-switch-hint">点按切换</span>
    </button>
  );
}
