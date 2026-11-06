// モヒカンの付け替えの規則（three.js・DOM に依存しない）。storage は引数で受け取る。
export const MOHAWK_COLORS = Object.freeze(['blue', 'red', 'yellow', 'green']);
const OWNABLE = Object.freeze(['red', 'yellow', 'green']);
const HUES = Object.freeze({ red: 0, yellow: 55, green: 120 });
const KEY = 'takuarinus-mohawk-color';

/** 1024×1024 テクスチャの左上のモヒカンの範囲 */
export const MOHAWK_REGION = Object.freeze({ x: 0, y: 0, width: 460, height: 190 });

export function hueFor(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(HUES, id) ? HUES[id] : null;
}

/** 青は常に先頭。所持色は red, yellow, green の順。未知・重複は除く */
export function availableColors(owned) {
  const list = Array.isArray(owned) ? owned : [];
  return ['blue', ...OWNABLE.filter((c) => list.includes(c))];
}

export function selectColor(owned, id, storage) {
  if (!availableColors(owned).includes(id)) return { ok: false };
  try {
    storage.setItem(KEY, id);
  } catch {
    // 保存できなくても選択は有効
  }
  return { ok: true, color: id };
}

export function loadSelectedColor(storage, owned) {
  try {
    const v = storage.getItem(KEY);
    return typeof v === 'string' && availableColors(owned).includes(v) ? v : 'blue';
  } catch {
    return 'blue';
  }
}

/** 画像の大きさに合わせて領域を換算する（基準は 1024） */
export function regionForSize(width, height, region = MOHAWK_REGION, base = 1024) {
  if (!(width > 0) || !(height > 0) || !(base > 0)) return { ...region };
  const sx = width / base;
  const sy = height / base;
  return {
    x: Math.round(region.x * sx),
    y: Math.round(region.y * sy),
    width: Math.round(region.width * sx),
    height: Math.round(region.height * sy),
  };
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  const q = (n) => Math.max(0, Math.min(255, Math.round(n + m)));
  return [q(r), q(g), q(b)];
}

/** HSV で青か（色相 190〜260°・彩度 0.25 以上・明度 0.12 以上） */
export function isBluePixel(r, g, b) {
  const { h, s, v } = rgbToHsv(Number(r) || 0, Number(g) || 0, Number(b) || 0);
  return h >= 190 && h <= 260 && s >= 0.25 && v / 255 >= 0.12;
}

/** 青なら色相だけを hue に置き換える（彩度・明度は保つ）。青でなければそのまま */
export function recolorPixel(r, g, b, hue) {
  if (hue === null || hue === undefined || !Number.isFinite(hue) || !isBluePixel(r, g, b)) return [r, g, b];
  const { s, v } = rgbToHsv(r, g, b);
  return hsvToRgb(hue, s, v);
}

/** 新しい配列を返す（入力は書き換えない）。領域内の青だけを置換、アルファは不変 */
export function recolorImageData(rgba, width, height, hue, region = MOHAWK_REGION) {
  const out = new Uint8ClampedArray(rgba);
  if (hue === null || hue === undefined || !Number.isFinite(hue)) return out;
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(width, Math.floor(region.x + region.width));
  const y1 = Math.min(height, Math.floor(region.y + region.height));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      if (!isBluePixel(r, g, b)) continue;
      const c = recolorPixel(r, g, b, hue);
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
    }
  }
  return out;
}
