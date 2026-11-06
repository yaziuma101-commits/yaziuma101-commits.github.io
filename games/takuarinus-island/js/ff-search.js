// 役に立たない検索。何を探しても見つからず、関係ないものを見つける。three.js・DOM に依存しない。
import { hashSeed } from './ff-rng.js';

export const SEARCH_SUBSTITUTES = Object.freeze([
  'とうふの思い出.bmp',
  'モヒカンくんの寝顔.bmp',
  'ぬ゛.wav',
  '謎の豆.txt',
  '冷蔵庫の中身.xls',
  'おなすくんの自撮り.bmp',
  'とうふ星人の手紙.txt',
  'タクアリヌスの鼻歌.mid',
]);

export function searchFiles(query, seed = 0) {
  const q = typeof query === 'string' ? query : String(query ?? '');
  if (!q.trim()) {
    return {
      hit: false, query: q, substitute: null, message: '検索する言葉を入力してください',
    };
  }
  const substitute = SEARCH_SUBSTITUTES[hashSeed(q, seed) % SEARCH_SUBSTITUTES.length];
  return {
    hit: false,
    query: q,
    substitute,
    message: `${q}は見つかりませんでした。代わりに『${substitute}』を見つけました`,
  };
}
