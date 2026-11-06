// 「ファイルを見つけろ」のおふざけの予定表と文言。three.js・DOM に依存しない。
import { makeRng, hashSeed } from './ff-rng.js';

const f = Object.freeze;

export const FUN_EVENT_DEFS = f({
  errorPopup: f({ maxBlockSec: 2 }),
  screensaver: f({ maxBlockSec: 2 }),
  assistant: f({ maxBlockSec: 1 }),
});

export const ERROR_POPUP_MESSAGES = f([
  'このプログラムは不正な処理を行ったので、とうふを強制終了します',
  'モヒカン.exe でエラーが発生しました。髪型を元に戻してから再試行してください',
  'とうふが足りません。冷蔵庫を確認してください',
]);

export const ASSISTANT_LINES = f([
  'ファイルを探しているようですね！ 手伝いましょうか？',
  'ファイルは、たぶんパソコンの中にありますよ！',
  'ダブルクリックとは、2回クリックすることです！',
  'わたしはモヒカンくん。とくに何もできません！',
]);

export function scheduleFun(seed, silly, durationSec) {
  const s = Math.min(1, Number(silly));
  if (!(s > 0)) return [];
  const rng = makeRng(hashSeed(seed, 'fun'));
  const base = 60 + (16 - 60) * s;
  const kinds = Object.keys(FUN_EVENT_DEFS);
  const end = Number(durationSec) - 5;
  const out = [];
  let t = 10 + rng.next() * base * 0.3;
  while (t <= end) {
    out.push({ t, kind: rng.pick(kinds) });
    t += base * (0.85 + 0.3 * rng.next());
  }
  return out;
}

/** 試合全体（5回戦ぶん）のおふざけの予定に使う長さ（秒） */
export const FF_FUN_DURATION_SEC = 600;

/** おふざけ度（0..maxLevel）→ 0..1 */
export function funSillyFraction(level, maxLevel = 3) {
  const n = Number(level);
  const m = Number(maxLevel);
  if (!Number.isFinite(n) || !(m > 0)) return 0;
  return Math.max(0, Math.min(1, n / m));
}

/** 予定 schedule の index 番目から、時刻 t までに来たものと、次の index */
export function dueFunEvents(schedule, index, t) {
  const list = Array.isArray(schedule) ? schedule : [];
  let i = Math.max(0, Math.floor(Number(index) || 0));
  const events = [];
  const now = Number(t);
  while (i < list.length && list[i] && Number.isFinite(now) && now >= list[i].t) {
    events.push(list[i]);
    i++;
  }
  return { events, index: i };
}

/** おふざけの文言。kind の nth 回目（モヒカンくんの最初は必ず「手伝いましょうか？」） */
export function funMessage(kind, seed, nth = 0) {
  const list = kind === 'errorPopup' ? ERROR_POPUP_MESSAGES : kind === 'assistant' ? ASSISTANT_LINES : null;
  if (!list) return '';
  if (kind === 'assistant' && !(nth > 0)) return list[0];
  return makeRng(hashSeed(seed, 'fun-msg', kind, nth)).pick(list);
}

/** エラー小窓の位置（画面の %） */
export function funPopupPos(seed, index) {
  const r = makeRng(hashSeed(seed, 'fun-pos', index));
  return { x: Math.round(14 + r.next() * 30), y: Math.round(12 + r.next() * 30) };
}

export function trashContents() {
  return [
    { name: 'とうふ', note: 'ぷるぷるしている。まだ食べられそう' },
    { name: '丸めた紙くず', note: '「とうふのレシピ」と書いてあったが読めない' },
    { name: '古いモヒカン', note: 'もう立たない' },
  ];
}
