// 確認用のセーブ（依頼者が全部遊ばずにエンディングを見られるように）。three.js・DOM に依存しない。
// タイトルの「確認用: クリアした状態にする」から選ぶ。保存の中身だけを決め、書き込みは main.js が行う。
import { BOSSES } from './bosses.js';
import { PAINTING_REWARDS, MANSION_GAME_IDS } from './paintings.js';
import { RESCUE_BY_BOSS } from './story.js';

export const REVIEW_PRESETS = Object.freeze([
  Object.freeze({ id: 'rise', label: '番長3人を倒した（島で先輩に話すと館がせり上がる）' }),
  Object.freeze({ id: 'finale', label: '館の9人も倒した（館に入ると本当のエンディング）' }),
  Object.freeze({ id: 'complete', label: '絵が24枚そろった（島に戻ると全部集めたイベント）' }),
]);

/**
 * タイトルに確認用のメニューを出すか（依頼者の指摘 2026-11-04: 公開する版では出さない。コードには残す）。
 * 手元・検査の版では出す。公開用の版（publicBuild）では、URL に ?debug=1 を付けたときだけ出す。
 */
export function reviewMenuShown(search = '', publicBuild = false) {
  if (!publicBuild) return true;
  let q;
  try {
    q = new URLSearchParams(String(search || ''));
  } catch {
    return false;
  }
  const v = q.get('debug');
  return v === '1' || v === 'true';
}

const BOSS_GAMES = BOSSES.map((b) => b.id);
const normalPaintings = (games) => PAINTING_REWARDS
  .filter((r) => r.tier === 'normal' && games.includes(r.gameId)).map((r) => r.paintingId);

/** 選んだ段の保存の中身。{mohicans, games, paintings, story, cleared}。知らない id は null */
export function reviewSave(presetId) {
  const preset = REVIEW_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  const mohicans = BOSSES.map((b) => b.mohican.id);
  const greeted = Object.values(RESCUE_BY_BOSS);
  const allGames = [...BOSS_GAMES, ...MANSION_GAME_IDS];
  const base = { openingSeen: true, greeted, mansionRisen: false, endingSeen: false, allPaintingsSeen: false };
  if (presetId === 'rise') {
    return { mohicans, games: [...BOSS_GAMES], paintings: normalPaintings(BOSS_GAMES), story: base, cleared: false };
  }
  if (presetId === 'finale') {
    return { mohicans, games: allGames, paintings: normalPaintings(allGames),
      story: { ...base, mansionRisen: true }, cleared: false };
  }
  return { mohicans, games: allGames, paintings: PAINTING_REWARDS.map((r) => r.paintingId),
    story: { ...base, mansionRisen: true, endingSeen: true }, cleared: true };
}
