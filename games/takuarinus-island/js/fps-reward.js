// モヒカン獲得の保存（progress.js / race-session.js の保存形式をそのまま使う薄い層）。
// キャッシュは持たず、呼ぶたびに globalThis.localStorage から読む。three.js・DOM には触らない。
import { BOSSES, MOHICAN_TOTAL } from './bosses.js';
import { recordBossWin, loadMohawks } from './race-session.js';

/** レジストリ順のボス id（末尾が FPS 番長） */
export const ALL_BOSS_IDS = Object.freeze(BOSSES.map((b) => b.id));
export const FPS_BOSS_ID = 'fps';
export const MOHAWK_TOTAL = MOHICAN_TOTAL;

function getStorage() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' && typeof s.setItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

/** 勝ちを保存する（同じ id を重ねても1件）。新しく手に入れたら true */
export function recordWin(bossId) {
  const s = getStorage();
  if (!s) return false;
  try {
    return recordBossWin(s, bossId);
  } catch {
    return false;
  }
}

/** 持っているモヒカンのボス id（レジストリ順） */
export function collectedBossIds() {
  const s = getStorage();
  if (!s) return [];
  try {
    return loadMohawks(s);
  } catch {
    return [];
  }
}

export function mohawkCount() {
  return collectedBossIds().length;
}

export function allMohawksCollected() {
  const ids = collectedBossIds();
  return ALL_BOSS_IDS.length === MOHAWK_TOTAL && ALL_BOSS_IDS.every((id) => ids.includes(id));
}
