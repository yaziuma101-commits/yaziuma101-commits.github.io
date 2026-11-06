// 高難易度の派手さ（three.js・DOM に依存しない）。依頼者の指摘（2026-11-04）「もっと派手でカオスに」。
// 遊んでいる間、画面の縁から火花が飛び、ときどき画面が揺れる。いつ何を出すかだけをここで決める。

/** 揺らさない場面（クリックやマス目の操作がずれると遊べない） */
export const CHAOS_NO_SHAKE = Object.freeze(['shogi', 'findfile', 'novel']);
export const SPARK_EVERY = Object.freeze([0.25, 0.7]); // 火花の間隔（秒）
export const SHAKE_EVERY = Object.freeze([6, 11]); // 揺れの間隔（秒）
export const SHAKE_TIME = 0.45;

const between = (r, [a, b]) => a + (b - a) * r;

export function createChaos(rng = Math.random) {
  return { sparkIn: between(rng(), SPARK_EVERY), shakeIn: between(rng(), SHAKE_EVERY), shakeLeft: 0, rng };
}

/**
 * 1フレーム進める。返り値 { sparks: [{x, y, size, hue}], shake: 0〜1（揺れの強さ） }。
 * x, y は画面に対する割合（0〜1）。火花は縁の近く（真ん中の操作の邪魔をしない）
 */
export function stepChaos(c, dt, scene = '') {
  const h = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
  const out = { sparks: [], shake: 0 };
  c.sparkIn -= h;
  while (c.sparkIn <= 0) {
    c.sparkIn += between(c.rng(), SPARK_EVERY);
    const edge = Math.floor(c.rng() * 4);
    const t = c.rng();
    const inset = c.rng() * 0.12;
    const x = edge === 0 ? inset : edge === 1 ? 1 - inset : t;
    const y = edge === 2 ? inset : edge === 3 ? 1 - inset : t;
    out.sparks.push({ x, y, size: 10 + Math.floor(c.rng() * 22), hue: Math.floor(c.rng() * 3) });
  }
  if (!CHAOS_NO_SHAKE.includes(scene)) {
    c.shakeIn -= h;
    if (c.shakeIn <= 0) {
      c.shakeIn = between(c.rng(), SHAKE_EVERY);
      c.shakeLeft = SHAKE_TIME;
    }
  }
  if (c.shakeLeft > 0) {
    c.shakeLeft = Math.max(0, c.shakeLeft - h);
    out.shake = c.shakeLeft / SHAKE_TIME;
  }
  return out;
}
