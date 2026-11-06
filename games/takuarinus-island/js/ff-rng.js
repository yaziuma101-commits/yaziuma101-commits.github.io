// 「ファイルを見つけろ」の種つき乱数（mulberry32）。three.js・DOM・Web Audio に依存しない。
// mini-rng.js の API には依存しない。

/** 種（数でも文字列でも）から決まった並びの乱数 */
export function makeRng(seed) {
  const n = Number(seed);
  let a = (Number.isFinite(n) ? Math.floor(n) : hashSeed(seed)) >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => {
    const lo = Math.ceil(Number(min));
    const hi = Math.floor(Number(max));
    if (!(hi >= lo)) return lo;
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  const pick = (arr) => (Array.isArray(arr) && arr.length ? arr[Math.floor(next() * arr.length)] : undefined);
  const chance = (p) => next() < p;
  const shuffle = (arr) => {
    const out = Array.isArray(arr) ? [...arr] : [];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return {
    next, int, pick, chance, shuffle,
  };
}

/** いくつかの値から符号なし 32bit の種を作る（決定的） */
export function hashSeed(...parts) {
  const s = parts.map((p) => String(p)).join('\u241f');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
