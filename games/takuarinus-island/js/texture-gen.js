// 手続きテクスチャの模様（three.js・DOM・canvas に依存しない）。
// 64x64 か 128x128 の RGBA を作る。模様はすべて周期関数（格子を折り返す value noise、
// サイズの約数の周期の目地、偶数マスのチェック）なので、繰り返して貼っても継ぎ目が合う。
// 色は今のポップな配色を保ち、暗くしない（各種の平均輝度は 100 以上）。

export const TEXTURE_KINDS = Object.freeze(['grass', 'cobble', 'brick', 'planks', 'sand', 'water', 'checker']);
export const TEXTURE_SIZES = Object.freeze([64, 128]);

const TAU = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);
const mix = (c1, c2, t) => {
  const k = clamp01(t);
  return [lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k)];
};

function hash3(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d)
    ^ Math.imul(((b | 0) + 0x165667b1) | 0, 0x9e3779b1)
    ^ Math.imul((c | 0) ^ 0x2545f491, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function normSeed(seed) {
  const n = Math.floor(Number(seed));
  return Number.isFinite(n) ? n | 0 : 0;
}

/** 格子を折り返す value noise（0〜1）。u,v は 0〜1、px,py は横・縦の格子の数（＝周期） */
export function periodicNoise(u, v, px, py, seed = 0) {
  const x = u * px;
  const y = v * py;
  const i0 = Math.floor(x);
  const j0 = Math.floor(y);
  const fx = smooth(x - i0);
  const fy = smooth(y - j0);
  const a = mod(i0, px);
  const b = mod(i0 + 1, px);
  const c = mod(j0, py);
  const d = mod(j0 + 1, py);
  const v00 = hash3(a, c, seed);
  const v10 = hash3(b, c, seed);
  const v01 = hash3(a, d, seed);
  const v11 = hash3(b, d, seed);
  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
}

function fbm(u, v, base, seed, octaves = 3) {
  let s = 0;
  let amp = 0.5;
  let tot = 0;
  for (let o = 0; o < octaves; o++) {
    const p = base << o;
    s += amp * periodicNoise(u, v, p, p, seed + o * 101);
    tot += amp;
    amp *= 0.5;
  }
  return s / tot;
}

// ---- 模様（x,y は画素、S は大きさ。[r,g,b] を返す） ----

function grass(x, y, S, seed) {
  const u = x / S;
  const v = y / S;
  const n = fbm(u, v, 4, seed);
  const streak = periodicNoise(u, v, 32, 2, seed + 7); // 縦の草筋
  const grain = hash3(x, y, seed + 13);
  let c = mix([46, 168, 52], [118, 228, 84], 0.5 * n + 0.3 * streak + 0.2 * grain);
  if (grain > 0.94) c = mix(c, [190, 245, 140], 0.6); // 光る葉先
  else if (grain < 0.05) c = mix(c, [30, 130, 40], 0.5); // 濃い粒
  return c;
}

function cobble(x, y, S, seed) {
  const n = 8;
  const cs = S / n;
  const gx = (x + 0.5) / cs;
  const gy = (y + 0.5) / cs;
  const ci = Math.floor(gx);
  const cj = Math.floor(gy);
  let d1 = 1e9;
  let d2 = 1e9;
  let id = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = ci + di;
      const j = cj + dj;
      const wi = mod(i, n);
      const wj = mod(j, n);
      const fx = i + 0.2 + 0.6 * hash3(wi, wj, seed);
      const fy = j + 0.2 + 0.6 * hash3(wi, wj, seed + 1);
      const d = Math.hypot(gx - fx, gy - fy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = wi * n + wj;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  const edge = d2 - d1;
  const tint = hash3(id, 0, seed + 2);
  const nz = fbm(x / S, y / S, 8, seed + 3, 2);
  const grain = hash3(x, y, seed + 4);
  const stone = mix([168, 170, 172], [230, 228, 220], 0.35 * tint + 0.4 * nz + 0.25 * grain);
  if (edge < 0.14) return mix(stone, [128, 124, 116], 0.75); // 細い目地
  const rim = Math.min(1, edge / 0.35);
  return mix([160, 158, 154], stone, 0.45 + 0.55 * rim);
}

function brick(x, y, S, seed) {
  const H = S / 8;
  const W = S / 4;
  const m = S / 64;
  const c = Math.floor(y / H);
  const xb = mod(x + (c % 2) * (W / 2), S); // 段ごとに半個ずらす
  const b = Math.floor(xb / W);
  const u = xb - b * W;
  const v = y - c * H;
  const grain = hash3(x, y, seed + 5);
  const nz = fbm(x / S, y / S, 8, seed + 6, 2);
  if (u < m || v < m) return mix([226, 220, 206], [248, 244, 234], 0.5 * grain + 0.5 * nz);
  const tint = hash3(b, c, seed + 7);
  let col = mix([200, 88, 58], [240, 132, 86], 0.45 * tint + 0.35 * nz + 0.2 * grain);
  if (v >= H - m) col = mix(col, [150, 60, 40], 0.35);
  return col;
}

function planks(x, y, S, seed) {
  const W = S / 4;
  const m = Math.max(1, S / 64);
  const b = Math.floor(x / W);
  const u = x - b * W;
  const joint = Math.floor(hash3(b, 0, seed + 8) * S);
  const tint = hash3(b, 1, seed + 9);
  const flow = periodicNoise(x / S, y / S, 32, 4, seed + 10); // 縦に流れる木目
  const rings = 0.5 + 0.5 * Math.sin(TAU * flow * 3);
  const grain = hash3(x, y, seed + 11);
  let col = mix([196, 138, 82], [240, 194, 128], 0.4 * tint + 0.35 * rings + 0.25 * grain);
  if (u < m) col = mix(col, [120, 76, 40], 0.7); // 縦の継ぎ目
  else if (u >= W - m) col = mix(col, [250, 214, 160], 0.3);
  if (mod(y - joint, S) < m) col = mix(col, [130, 84, 46], 0.6);
  return col;
}

function sand(x, y, S, seed) {
  const n = fbm(x / S, y / S, 4, seed + 12);
  const ripple = 0.5 + 0.5 * Math.sin(TAU * (3 * y / S + 0.6 * periodicNoise(x / S, y / S, 4, 4, seed + 13)));
  const grain = hash3(x, y, seed + 14);
  let col = mix([226, 190, 120], [255, 234, 164], 0.45 * n + 0.2 * ripple + 0.35 * grain);
  if (grain > 0.96) col = mix(col, [255, 250, 230], 0.7);
  else if (grain < 0.04) col = mix(col, [190, 150, 95], 0.6);
  return col;
}

function water(x, y, S, seed) {
  const u = x / S;
  const v = y / S;
  const n = fbm(u, v, 4, seed + 15);
  const w1 = Math.sin(TAU * (4 * v + 0.35 * Math.sin(TAU * 2 * u) + 0.5 * n));
  const w2 = Math.sin(TAU * (3 * u - 2 * v + 0.4 * n));
  const t = 0.5 + 0.3 * w1 + 0.2 * w2;
  let col = mix([36, 150, 228], [110, 212, 250], t * 0.8 + 0.2 * n);
  if (w1 > 0.93) col = mix(col, [235, 250, 255], 0.65); // 波頭
  return col;
}

function checker(x, y, S, seed) {
  const n = 8;
  const cs = S / n;
  const odd = (Math.floor(x / cs) + Math.floor(y / cs)) % 2;
  const grain = hash3(x, y, seed + 16);
  const nz = fbm(x / S, y / S, 8, seed + 17, 2);
  const a = odd ? [246, 170, 196] : [255, 246, 222]; // ピンクとクリーム
  const k = 0.92 + 0.08 * (0.6 * nz + 0.4 * grain);
  let col = [a[0] * k, a[1] * k, a[2] * k];
  if (x % cs === 0 || y % cs === 0) col = mix(col, [200, 180, 170], 0.25);
  return col;
}

const PATTERNS = Object.freeze({ grass, cobble, brick, planks, sand, water, checker });

/** 巡回シフト量：隣り合う列（行）の差がいちばん小さい所を端に置く */
function quietShift(rgb, S, axis) {
  let best = 0;
  let bestSum = Infinity;
  for (let k = 0; k < S; k++) {
    let s = 0;
    for (let t = 0; t < S; t++) {
      const i = axis === 'x' ? (t * S + k) * 3 : (k * S + t) * 3;
      const j = axis === 'x' ? (t * S + ((k + 1) % S)) * 3 : ((((k + 1) % S) * S) + t) * 3;
      s += Math.abs(rgb[i] - rgb[j]) + Math.abs(rgb[i + 1] - rgb[j + 1]) + Math.abs(rgb[i + 2] - rgb[j + 2]);
    }
    if (s < bestSum) {
      bestSum = s;
      best = k;
    }
  }
  return (best + 1) % S;
}

/** 模様の画素 {width,height,data(RGBA)}。同じ (kind,size,seed) なら同じ配列 */
export function generateTexturePixels(kind, size, seed = 1) {
  if (!TEXTURE_KINDS.includes(kind)) throw new RangeError(`未知のテクスチャ: ${kind}`);
  if (!TEXTURE_SIZES.includes(size)) throw new RangeError(`テクスチャの大きさは 64 か 128: ${size}`);
  const pattern = PATTERNS[kind];
  const s = normSeed(seed);
  const S = size;
  const rgb = new Uint8ClampedArray(S * S * 3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = pattern(x, y, S, s);
      const i = (y * S + x) * 3;
      rgb[i] = c[0];
      rgb[i + 1] = c[1];
      rgb[i + 2] = c[2];
    }
  }
  // 模様は周期的なので巡回シフトしても繰り返しの見た目は同じ。継ぎ目を一番静かな所に置く
  const sx = quietShift(rgb, S, 'x');
  const sy = quietShift(rgb, S, 'y');
  const data = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const src = ((((y + sy) % S) * S) + ((x + sx) % S)) * 3;
      const dst = (y * S + x) * 4;
      data[dst] = rgb[src];
      data[dst + 1] = rgb[src + 1];
      data[dst + 2] = rgb[src + 2];
      data[dst + 3] = 255;
    }
  }
  return { width: S, height: S, data };
}

function wrap01(x) {
  const r = x % 1;
  return r < 0 ? (r + 1) % 1 : r;
}

/** 水面の UV のずれ（毎フレーム texture.offset に入れる） */
export function waterUvOffset(t) {
  const x = Number.isFinite(t) ? t : 0;
  return { u: wrap01(x * 0.03), v: wrap01(x * 0.02) };
}

/** 面の大きさから繰り返し回数を決める（1 タイル ≒ tile ワールド単位、最低 1） */
export function textureRepeat(width, height, tile = 3) {
  const t = Number.isFinite(tile) && tile > 0 ? tile : 3;
  const r = (d) => Math.max(1, Math.round((Number.isFinite(d) && d > 0 ? d : t) / t));
  return [r(width), r(height)];
}
