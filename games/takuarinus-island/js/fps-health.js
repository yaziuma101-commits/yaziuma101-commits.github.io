// 主人公のハートと番長の体力（three.js・DOM に依存しない）。状態は不変に扱う
export const MAX_HEARTS = 3;
export const INVULN_TIME = 1.0;
export const BOSS_MAX_HP = 30;

/** bonus: 持ち込みの「体力+1」など（ハートが増える） */
export function createPlayerHealth(bonus = 0) {
  const b = Number.isFinite(bonus) && bonus > 0 ? Math.floor(bonus) : 0;
  return { hearts: MAX_HEARTS + b, invuln: 0 };
}

/** 当たったとき。無敵中は変化なし */
export function hitPlayer(h) {
  if (h.invuln > 0) return { health: h, damaged: false };
  return { health: { hearts: Math.max(0, h.hearts - 1), invuln: INVULN_TIME }, damaged: true };
}

export function tickHealth(h, dt) {
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  return { ...h, invuln: Math.max(0, h.invuln - d) };
}

export function isPlayerDefeated(h) {
  return h.hearts <= 0;
}

/** n は1発のダメージ（持ち込みで 1.2 など）。小数の誤差で倒れ損ねないよう千分の一で丸める */
export function damageBoss(hp, n = 1) {
  const d = Number.isFinite(n) && n > 0 ? n : 1;
  return Math.max(0, Math.round((hp - d) * 1000) / 1000);
}

export function isBossDown(hp) {
  return hp <= 1e-9;
}
