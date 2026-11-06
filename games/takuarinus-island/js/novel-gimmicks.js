// 小説のおふざけの抽選とページ列の組み立て（three.js・DOM・Web Audio に依存しない）。
import { hashUnit } from './kendama-tricks.js';

export const FILLER_TEXT = 'ここまで読んだあなたは えらい';
export const GIMMICK_MAX_SEC = 2;
const RATES = Object.freeze([0, 0.2, 0.35, 0.5]);
const KINDS = Object.freeze(['upsideDown', 'filler', 'fakeBuzz']);

function clampSilliness(s) {
  const n = Math.round(Number(s));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, n));
}

/** 1問につき最大1つのおふざけ */
export function planGimmick({
  seed, questionNumber, silliness, totalPages,
} = {}) {
  const none = { kind: null, pageIndex: null, durationSec: 0 };
  const s = clampSilliness(silliness);
  if (s === 0) return none;
  const r = (k) => hashUnit(seed, 'novel-gimmick', questionNumber ?? 0, k);
  if (r(1) >= RATES[s]) return none;
  const kind = KINDS[Math.min(KINDS.length - 1, Math.floor(r(2) * KINDS.length))];
  const total = Math.max(1, Math.floor(Number(totalPages)) || 1);
  if (kind === 'upsideDown') {
    return { kind, pageIndex: Math.min(total - 1, Math.floor(r(3) * total)), durationSec: 1.2 };
  }
  if (kind === 'filler') {
    const m = Math.max(1, total - 1);
    return { kind, pageIndex: Math.min(m - 1, Math.floor(r(3) * m)), durationSec: 1.2 };
  }
  return { kind, pageIndex: null, durationSec: 0.6 };
}

/** ページ列。realPage は「そこまでに現れた本文ページ数」（関係ないページは数えない） */
export function buildDeck(pages, plan) {
  const p = plan && typeof plan === 'object' ? plan : { kind: null };
  const deck = [];
  (Array.isArray(pages) ? pages : []).forEach((text, i) => {
    deck.push({
      text, kind: 'story', realPage: i + 1, upsideDown: p.kind === 'upsideDown' && p.pageIndex === i,
    });
    if (p.kind === 'filler' && p.pageIndex === i) {
      deck.push({
        text: FILLER_TEXT, kind: 'filler', realPage: i + 1, upsideDown: false,
      });
    }
  });
  return deck;
}

/** 逆さまのページを、いま逆さまに見せるか（そのページを読んだ秒数が持続時間より短い間だけ） */
export function upsideDownActive(entry, shownSec, plan) {
  if (!entry || entry.upsideDown !== true) return false;
  const dur = plan && plan.durationSec > 0 ? Math.min(GIMMICK_MAX_SEC, plan.durationSec) : 0;
  const s = Number.isFinite(Number(shownSec)) ? Number(shownSec) : 0;
  return s < dur;
}

/** 早押しの音の順番。fakeBuzz なら先に「ブッブー」、持続時間のあとに正しい「ピンポーン」 */
export function buzzSequence(plan) {
  if (plan && plan.kind === 'fakeBuzz') {
    const at = Math.min(GIMMICK_MAX_SEC, plan.durationSec > 0 ? plan.durationSec : 0.6);
    return [{ sound: 'fakeBuzz', at: 0 }, { sound: 'buzz', at }];
  }
  return [{ sound: 'buzz', at: 0 }];
}
