// けん玉（高く上げる版）の高さによる得点の段階と、溜めの目安・受けたときの表示の文字。
// three.js・DOM・Web Audio に依存しない。

/** 高さの段階（下限 m 以上で points 点） */
export const HEIGHT_TIERS = Object.freeze([
  Object.freeze({ min: 12, points: 10, name: 'とても高い' }),
  Object.freeze({ min: 8, points: 6, name: '高い' }),
  Object.freeze({ min: 4, points: 3, name: '中くらい' }),
  Object.freeze({ min: -Infinity, points: 1, name: '低い' }),
]);

/** 溜め 0〜1 → 上がる高さ（m）の既定の見積もり */
export const PREVIEW_MIN_H = 2;
export const PREVIEW_MAX_H = 16;
export function defaultHeightForCharge(charge) {
  const c = Math.max(0, Math.min(1, Number(charge) || 0));
  return PREVIEW_MIN_H + (PREVIEW_MAX_H - PREVIEW_MIN_H) * c;
}

export function heightTier(h) {
  const v = Number.isFinite(Number(h)) ? Number(h) : 0;
  return HEIGHT_TIERS.find((t) => v >= t.min);
}

/** 高さ（m）→ 得点。主人公も相手も同じ */
export function heightPoints(h) {
  return heightTier(h).points;
}

/** 溜め中の目安「高さ 9m・6点」 */
export function chargePreviewText(charge, heightFn = defaultHeightForCharge) {
  const f = typeof heightFn === 'function' ? heightFn : defaultHeightForCharge;
  const h = Number(f(charge)) || 0;
  return `高さ ${Math.round(h)}m・${heightPoints(h)}点`;
}

/** 受けたときの大きな表示「+6点（9m）」 */
export function catchPopText(h) {
  const v = Number(h) || 0;
  return `+${heightPoints(v)}点（${Math.round(v)}m）`;
}
