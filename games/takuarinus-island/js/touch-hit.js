// モヒカンタッチタッチの当たり判定（厳しめ）と、腕の骨で手を伸ばす角度（three.js・DOM に依存しない）。
// 当たりは「手の先」がモヒカンの範囲を半分に狭めた箱の中に入ったときだけ。相手が少しでも避けていれば外れ。

/** 今までの当たりの範囲に対する倍率（半分） */
export const HIT_SHRINK = 0.5;

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

/**
 * tip: 手の先 {x,y,z}
 * mohawk: {x, y(付け根の高さ), z, halfWidth, height, halfDepth}
 * dodge: 相手の避け具合（0 なら避けていない）
 */
export function mohawkHit({ tip, mohawk, dodge = 0 } = {}) {
  if (!tip || !mohawk) return false;
  if (fin(dodge) > 0) return false;
  const hw = fin(mohawk.halfWidth, 0.3) * HIT_SHRINK;
  const hd = fin(mohawk.halfDepth, 0.1) * HIT_SHRINK;
  const h = fin(mohawk.height, 0.8);
  // 高さも中央の半分の帯だけ
  const y0 = fin(mohawk.y) + h * (1 - HIT_SHRINK) / 2;
  const y1 = y0 + h * HIT_SHRINK;
  return Math.abs(fin(tip.x, Infinity) - fin(mohawk.x)) <= hw
    && Math.abs(fin(tip.z, Infinity) - fin(mohawk.z)) <= hd
    && fin(tip.y, -Infinity) >= y0 && fin(tip.y, Infinity) <= y1;
}

/**
 * 手を伸ばす量 reach（0〜1）から腕の骨の回転（ラジアン）。
 * 0 は腕を下げた姿勢、1 は肩を前に上げ、肘をまっすぐ伸ばした姿勢。
 */
export function armReachAngles(reach) {
  const r = Math.min(1, Math.max(0, fin(Number(reach))));
  return {
    shoulderX: -1.45 * r,
    shoulderZ: 0.2 * (1 - r),
    elbowX: -0.9 * (1 - r) * (r > 0 ? 1 : 0) + 0,
  };
}
