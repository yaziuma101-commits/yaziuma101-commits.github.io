// 真っ暗ソウルの「捕まったら一発でアウト」と結果の規則（three.js・DOM・Web Audio に依存しない）。
// 敵は ds-stalker-ai.js の1体だけ。体力・攻撃・回避・ソウル・ボスはない。
// 必勝ハチマキを持ち込んだときだけ、1回だけ振りほどける。
import { createRun, SPAWN_INVULN, formatTime } from './ds-state.js';
import { CANDLES } from './ds-map.js';

/** 振りほどいたあと、捕まらない時間（秒） */
export const BREAK_FREE_INVULN = 2;

/** 1プレイを作る（地下室の扉の鍵があれば外へ出られる） */
export function createEscapeRun(opts = {}) {
  return createRun(opts && typeof opts === 'object' ? opts : {});
}

/** いま捕まりうるか（戻った直後・振りほどいた直後・外へ出たあとは捕まらない） */
export function canBeCaught(s) {
  return !!s && !s.exited && !(Number(s.invuln) > 0);
}

/** 捕まりかけたとき、振りほどけるなら回数を1つ使って true（必勝ハチマキ） */
export function tryBreakFree(s) {
  if (!canBeCaught(s) || !(Number(s.breakFree) > 0)) return false;
  s.breakFree = Math.max(0, Math.floor(Number(s.breakFree)) - 1);
  s.invuln = BREAK_FREE_INVULN;
  s.running = false;
  return true;
}

/**
 * 捕まった。最後に休んだろうそくから再開する。
 * ヒューズ・鍵・メモ・電池など、謎解きの進み具合はそのまま残す。
 */
export function captureRun(s) {
  if (!s) return null;
  s.captures = (Number(s.captures) || 0) + 1;
  s.stamina = s.staminaMax;
  s.running = false;
  const c = CANDLES.find((q) => q.id === s.candle) || CANDLES[0];
  s.pos = { x: c.x, z: c.z };
  s.invuln = SPAWN_INVULN;
  return c;
}

/** 結果（外へ出たか・時間・捕まった回数） */
export function escapeResult(s) {
  const n = Math.max(0, Math.floor(Number(s && s.captures) || 0));
  return {
    cleared: !!(s && s.exited), time: s ? Number(s.time) || 0 : 0, captures: n,
  };
}

/** 結果の画面（時間・捕まった回数と「もう一度」「館に戻る」） */
export function escapeResultView(result, extra = []) {
  const r = result && typeof result === 'object' ? result : {};
  const n = Math.max(0, Math.floor(Number(r.captures) || 0));
  return {
    title: r.cleared ? '屋敷の外へ出た' : '……',
    tone: r.cleared ? 'good' : '',
    lines: [
      `時間　${formatTime(r.time)}`,
      `捕まった回数　${n}回`,
      // 結果の画面には、古い仕組み（ソウル・体力）の行は出さない
      ...(Array.isArray(extra) ? extra.filter((x) => typeof x === 'string' && x && !/ソウル|体力/.test(x)) : []),
    ],
    choices: [{ id: 'again', label: 'もう一度' }, { id: 'gallery', label: '館に戻る' }],
  };
}
