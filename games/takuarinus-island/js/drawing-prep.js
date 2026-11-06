// 絵の下ごしらえ（three.js・DOM・Web Audio に依存しない）。
// 入力・出力は ImageData と同じ形 { data: Uint8ClampedArray(RGBA), width, height }。入力は書き換えない。
// 細い線の手描きは、そのまま縮めると地の色に平均されて消えるので、
// 先に線を太らせ（膨張）→ 縮め（箱平均）→ 地を紙色・線を濃く（コントラスト）する。

/** 線とみなす「地の色との差（各チャンネル差の最大）」のしきい値 */
export const LINE_THRESHOLD = 24;
/** この差で完全に線の色になる */
export const CONTRAST_SPAN = 40;
/** 線を地の色から遠ざける倍率 */
export const DEEPEN = 1.5;
/** 地を寄せる明るい紙の色 */
export const PAPER = Object.freeze([250, 247, 238]);

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function blank(w, h) {
  return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
}

/** 長い辺を longSide にそろえた大きさ（拡大もする） */
export function fitSize(width, height, longSide = 256) {
  const L = Math.max(1, Math.round(Number(longSide) || 256));
  const w = Number(width) > 0 ? Number(width) : 1;
  const h = Number(height) > 0 ? Number(height) : 1;
  if (w >= h) return { width: L, height: Math.max(1, Math.round((h * L) / w)) };
  return { width: Math.max(1, Math.round((w * L) / h)), height: L };
}

/** 地の色。>>4 で量子化した色の最頻バケットに入る画素の平均 */
export function detectBackground(img) {
  const { data } = img;
  const count = new Uint32Array(4096);
  const sums = new Float64Array(4096 * 3);
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    count[k] += 1;
    sums[k * 3] += r;
    sums[k * 3 + 1] += g;
    sums[k * 3 + 2] += b;
    total += 1;
  }
  if (!total) return [255, 255, 255];
  let best = 0;
  for (let k = 1; k < 4096; k++) if (count[k] > count[best]) best = k;
  const n = count[best];
  return [Math.round(sums[best * 3] / n), Math.round(sums[best * 3 + 1] / n), Math.round(sums[best * 3 + 2] / n)];
}

/** 縮める前に線を太らせる半径 */
export function dilateRadius(srcW, srcH, dstW, dstH) {
  const s = Math.max(Number(srcW) || 0, Number(srcH) || 0);
  const d = Math.max(Number(dstW) || 0, Number(dstH) || 0);
  if (!(s > 0) || !(d > 0)) return 1;
  const factor = s / d;
  if (factor <= 1) return 1;
  return Math.max(1, Math.ceil(factor / 2));
}

/**
 * 線の画素を周りに広げる（チェビシェフ距離 radius 以内）。
 * 範囲内に線があれば、そのうち地の色から最も遠い画素の色にする。無ければ元のまま。
 */
export function dilateLines(img, radius, bg = detectBackground(img)) {
  const { data, width: w, height: h } = img;
  const r = Math.max(0, Math.floor(Number(radius)) || 0);
  const n = w * h;
  const dist = new Int16Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const d = Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2]));
    dist[p] = d > LINE_THRESHOLD ? d : 0;
  }
  // 横に最大を取り、そのあと縦に最大を取る（正方形の範囲の最大と同じ）
  const hIdx = new Int32Array(n).fill(-1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let best = -1;
      let bd = 0;
      const x1 = Math.min(w - 1, x + r);
      for (let xx = Math.max(0, x - r); xx <= x1; xx++) {
        const q = row + xx;
        if (dist[q] > bd) {
          bd = dist[q];
          best = q;
        }
      }
      hIdx[row + x] = best;
    }
  }
  const out = blank(w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      let best = -1;
      let bd = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const q = hIdx[yy * w + x];
        if (q >= 0 && dist[q] > bd) {
          bd = dist[q];
          best = q;
        }
      }
      const p = y * w + x;
      const src = (best >= 0 ? best : p) * 4;
      const i = p * 4;
      o[i] = data[src];
      o[i + 1] = data[src + 1];
      o[i + 2] = data[src + 2];
      o[i + 3] = 255;
    }
  }
  return out;
}

/** 箱平均で縮める（拡大のときは最近傍） */
export function shrinkImage(img, width, height) {
  const { data, width: sw, height: sh } = img;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const out = blank(w, h);
  const o = out.data;
  for (let oy = 0; oy < h; oy++) {
    const y0 = Math.min(sh - 1, Math.floor((oy * sh) / h));
    const y1 = Math.min(sh, Math.max(y0 + 1, Math.floor(((oy + 1) * sh) / h)));
    for (let ox = 0; ox < w; ox++) {
      const x0 = Math.min(sw - 1, Math.floor((ox * sw) / w));
      const x1 = Math.min(sw, Math.max(x0 + 1, Math.floor(((ox + 1) * sw) / w)));
      let r = 0;
      let g = 0;
      let b = 0;
      let c = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * sw + x0) * 4;
        for (let x = x0; x < x1; x++) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          c += 1;
          i += 4;
        }
      }
      const j = (oy * w + ox) * 4;
      o[j] = Math.round(r / c);
      o[j + 1] = Math.round(g / c);
      o[j + 2] = Math.round(b / c);
      o[j + 3] = 255;
    }
  }
  return out;
}

/** 地を明るい紙色に寄せ、線は地の色から遠ざけて濃く（色味は保つ） */
export function enhanceContrast(img, bg = detectBackground(img)) {
  const { data, width: w, height: h } = img;
  const out = blank(w, h);
  const o = out.data;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
    const t = Math.max(0, Math.min(1, dist / CONTRAST_SPAN));
    const dr = clamp255(bg[0] + (r - bg[0]) * DEEPEN);
    const dg = clamp255(bg[1] + (g - bg[1]) * DEEPEN);
    const db = clamp255(bg[2] + (b - bg[2]) * DEEPEN);
    o[i] = Math.round(PAPER[0] * (1 - t) + dr * t);
    o[i + 1] = Math.round(PAPER[1] * (1 - t) + dg * t);
    o[i + 2] = Math.round(PAPER[2] * (1 - t) + db * t);
    o[i + 3] = 255;
  }
  return out;
}

/** 下ごしらえ一式：地の色を検出 → 線を太らせる → 縮める → 濃くする */
export function prepareDrawing(img, longSide = 256) {
  const bg = detectBackground(img);
  const size = fitSize(img.width, img.height, longSide);
  const r = dilateRadius(img.width, img.height, size.width, size.height);
  return enhanceContrast(shrinkImage(dilateLines(img, r, bg), size.width, size.height), bg);
}
