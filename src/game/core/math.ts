export const TAU = Math.PI * 2;

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

// Colours are rebuilt hundreds of times per frame; the conversion is pure, so
// memoise it instead of allocating a handful of strings on every call. Alphas
// are quantised to a thousandth so animated fades reuse the same entries.
export const alphaCache = new Map<string, string>();
export const withAlpha = (hex: string, alpha: number) => {
  const a = Math.round(alpha * 1000) / 1000;
  const key = `${hex}|${a}`;
  const cached = alphaCache.get(key);
  if (cached !== undefined) return cached;
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const result = `rgba(${r}, ${g}, ${b}, ${a})`;
  if (alphaCache.size > 512) alphaCache.clear();
  alphaCache.set(key, result);
  return result;
};

export function segmentCircleHit(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq > 0) {
    t = clamp(((cx - x1) * dx + (cy - y1) * dy) / lengthSq, 0, 1);
  }
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= radius * radius;
}

export function turnTowards(from: number, to: number, t: number) {
  return from + angleDelta(from, to) * clamp(t, 0, 1);
}

/** Shortest signed turn from `from` to `to`, in (-PI, PI]. */
export function angleDelta(from: number, to: number) {
  return ((((to - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}
