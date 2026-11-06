// 種付き乱数（mulberry32）。three.js・DOM に依存しない。
// 純粋関数には必ず rng（() => [0,1)）を引数で渡す。

/** 種から乱数列を作る。同じ種なら同じ列。種 0 でも定数列にならない */
export function createRng(seed) {
  const n = Number(seed);
  let t = (Number.isFinite(n) ? Math.floor(n) : 0) >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 本番用の種（Date.now() 由来） */
export function timeSeed() {
  return (Date.now() ^ 0x5bd1e995) >>> 0;
}

/** 一様に1つ選ぶ。空なら undefined */
export function pick(rng, list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const i = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[i];
}

function weightOf(item) {
  if (!item || item.weight === undefined || item.weight === null) return 1;
  const w = Number(item.weight);
  return Number.isFinite(w) && w > 0 ? w : 0;
}

/** weight（既定 1）で重み付きに1つ選ぶ。weight<=0 の要素は選ばない。候補が無ければ undefined */
export function pickWeighted(rng, list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  let total = 0;
  for (const it of list) total += weightOf(it);
  if (!(total > 0)) return undefined;
  let r = rng() * total;
  let lastOk;
  for (const it of list) {
    const w = weightOf(it);
    if (w <= 0) continue;
    lastOk = it;
    if (r < w) return it;
    r -= w;
  }
  return lastOk;
}
