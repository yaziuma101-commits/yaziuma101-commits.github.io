// 真っ暗ソウルの描き方の規則（three.js・DOM・Web Audio に依存しない）。
// このゲームだけ、内部 320×240 の引き伸ばしをやめて画面の解像度で描く。
const f = Object.freeze;

/** ほかのゲームの内部解像度（マリオ64風の引き伸ばし） */
export const RETRO_SIZE = f({ width: 320, height: 240 });
/** 画面の解像度で描くときのピクセル比の上限 */
export const MAX_PIXEL_RATIO = 2;
/** 懐中電灯の影 */
export const DS_SHADOW = f({
  mapSize: 1024, bias: -0.0005, normalBias: 0.03, near: 0.1, far: 12,
});

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** 描く大きさ。full が偽なら 320×240・ピクセル比 1、真なら画面の大きさ（ピクセル比は 1〜2） */
export function renderSizeFor({
  full = false, width = 0, height = 0, dpr = 1,
} = {}) {
  if (!full) return { width: RETRO_SIZE.width, height: RETRO_SIZE.height, pixelRatio: 1 };
  const w = fin(width) && width >= 1 ? Math.floor(width) : 1;
  const h = fin(height) && height >= 1 ? Math.floor(height) : 1;
  const pr = fin(dpr) && dpr > 0 ? Math.max(1, Math.min(MAX_PIXEL_RATIO, dpr)) : 1;
  return { width: w, height: h, pixelRatio: pr };
}
