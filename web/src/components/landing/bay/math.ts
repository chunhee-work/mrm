export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (x: number) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
/** 0 before a, 1 after b, eased in between. */
export const seg = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
/** Rises a→b, holds, falls c→d. */
export const pulse = (t: number, a: number, b: number, c: number, d: number) => seg(t, a, b) * (1 - seg(t, c, d));

/** Seeded random numbers: the picture must be the same on every load. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth curve through sorted key points [x, y] (Catmull-Rom tangents). */
export function curve(pts: readonly (readonly [number, number])[], x: number): number {
  const n = pts.length;
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[n - 1][0]) return pts[n - 1][1];
  let i = 0;
  while (x > pts[i + 1][0]) i++;
  const m = (k: number) =>
    k === 0 ? (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0])
    : k === n - 1 ? (pts[n - 1][1] - pts[n - 2][1]) / (pts[n - 1][0] - pts[n - 2][0])
    : (pts[k + 1][1] - pts[k - 1][1]) / (pts[k + 1][0] - pts[k - 1][0]);
  const [x0, y0] = pts[i];
  const [x1, y1] = pts[i + 1];
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m(i) + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m(i + 1);
}
