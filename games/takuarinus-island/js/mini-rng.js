// 種付き乱数（mulberry32）。three.js・DOM・Web Audio に依存しない。
// createRng(seed) → { next, int, range, pick, chance }。同じ種なら同じ列。

export function createRng(seed) {
  const n = Number(seed);
  let t = (Number.isFinite(n) ? Math.floor(n) : 0) >>> 0;
  const next = () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const int = (k) => {
    const m = Math.floor(Number(k));
    if (!(m > 0)) return 0;
    return Math.min(m - 1, Math.floor(next() * m));
  };
  const range = (a, b) => {
    const v = a + next() * (b - a);
    return v >= b && b > a ? a : v;
  };
  const pick = (arr) => (Array.isArray(arr) && arr.length ? arr[int(arr.length)] : undefined);
  const chance = (p) => next() < p;
  return {
    next, int, range, pick, chance,
  };
}
