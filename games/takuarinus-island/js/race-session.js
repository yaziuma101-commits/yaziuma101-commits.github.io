// モヒカン獲得の保存（progress.js の保存形式をそのまま使う薄い層）
import { BOSSES } from './bosses.js';
import {
  loadProgress, saveProgress, collectMohican, isBossDefeated,
} from './progress.js';

/** ボスに勝ったことを記録する（冪等）。新規なら true */
export function recordBossWin(storage, bossId) {
  const boss = BOSSES.find((b) => b.id === bossId);
  if (!boss) return false;
  const r = collectMohican(loadProgress(storage), boss.mohican.id);
  saveProgress(storage, r.state);
  return r.isNew;
}

export function recordRaceWin(storage) {
  return recordBossWin(storage, 'race');
}

/** 所持しているボス id の配列 */
export function loadMohawks(storage) {
  const state = loadProgress(storage);
  return BOSSES.filter((b) => isBossDefeated(state, b.id)).map((b) => b.id);
}

export function countMohawks(storage) {
  return loadMohawks(storage).length;
}
