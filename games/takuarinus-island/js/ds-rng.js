// 真っ暗ソウルの乱数（three.js・DOM・Web Audio に依存しない）。mulberry32 形式。
// 同じ種なら同じ列になる。

/** 種から [0,1) の数を返す関数を作る */
export function makeRng(seed) {
  const n = Number(seed);
  let t = (Number.isFinite(n) ? Math.floor(n) : 0) >>> 0;
  return function next() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0..n-1 の整数 */
export function rngInt(rng, n) {
  const k = Math.floor(Number(n));
  if (!(k > 0)) return 0;
  return Math.min(k - 1, Math.floor(rng() * k));
}

/** 並べ替えた新しい配列（元の配列は変えない） */
export function shuffle(rng, arr) {
  const out = Array.isArray(arr) ? [...arr] : [];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
