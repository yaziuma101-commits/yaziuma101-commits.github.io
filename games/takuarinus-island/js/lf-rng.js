// レバガチャファイターヌスの乱数（mulberry32）。three.js・DOM・Web Audio に依存しない。
// makeRng(seed) は () => [0,1) を返す。同じ種なら同じ列。

export function makeRng(seed) {
  const n = Number(seed);
  let a = (Number.isFinite(n) ? Math.floor(n) : 0) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 文字列や数の並びから種を作る（同じ入力なら同じ種） */
export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    for (const c of String(p)) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 31;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 本番用の種（Math.random と時刻から）。テストでは使わない */
export function randomSeed() {
  return ((Math.floor(Math.random() * 4294967296) ^ Date.now()) >>> 0);
}
