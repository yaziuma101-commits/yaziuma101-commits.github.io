// タバコヌスの AI（three.js・DOM・Web Audio に依存しない）。すべて種から決まる。
import { PAGE_SEC } from './novel-rules.js';
import { hashUnit } from './kendama-tricks.js';

export const AI_MAX = Object.freeze({ 1: 0.55, 2: 0.68, 3: 0.8 });
const BUZZ_BASE = Object.freeze({ 1: 0.85, 2: 0.7, 3: 0.55 });
/** タバコヌスが1ページ読むのにかかる秒数（主人公は自分でめくるので、相手はのんびり読む） */
export const AI_PAGE_SEC = 2.5;
/** 決めたページに着いてから押すまでの考える時間（秒）: 3〜5 */
export const AI_THINK_MIN = 3;
export const AI_THINK_RANGE = 2;

export function clampNovelStrength(strength) {
  const n = Math.round(Number(strength));
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(3, n));
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 読んだページが多いほど・強いほど正解しやすい */
export function aiCorrectProb(pagesRead, total, strength) {
  const n = Math.max(1, Number(total) || 1);
  const ratio = clamp((Number(pagesRead) || 0) / n, 0, 1);
  return 0.25 + (AI_MAX[clampNovelStrength(strength)] - 0.25) * ratio;
}

export function pagesReadAt(time, total, pageSec = PAGE_SEC) {
  const n = Math.max(1, Math.floor(Number(total)) || 1);
  const t = Number.isFinite(time) ? time : 0;
  return clamp(Math.floor(t / pageSec) + 1, 1, n);
}

const wrongChoices = (question, excluded = []) => [0, 1, 2, 3]
  .filter((i) => i !== question.answer && !excluded.includes(i));

/** 早押しの計画 */
export function planAiBuzz({
  seed, questionNumber, strength, totalPages, question,
}) {
  const st = clampNovelStrength(strength);
  const total = Math.max(1, Math.floor(Number(totalPages)) || 1);
  const r = (k) => hashUnit(seed, 'novel-ai', questionNumber, k);
  const frac = clamp(BUZZ_BASE[st] + (r(1) - 0.5) * 0.3, 0.1, 1);
  // 最後まで待った相手より必ず先に押す（最後のページに入る前に押す）
  const buzzPage = clamp(Math.ceil(total * frac), 1, Math.max(1, total - 1));
  const buzzTime = (buzzPage - 1) * AI_PAGE_SEC + AI_THINK_MIN + r(2) * AI_THINK_RANGE;
  const pagesRead = buzzPage;
  const correct = r(3) < aiCorrectProb(pagesRead, total, st);
  let choiceIndex = question.answer;
  if (!correct) {
    const w = wrongChoices(question);
    choiceIndex = w[Math.min(w.length - 1, Math.floor(r(4) * w.length))];
  }
  return {
    buzzTime, pagesRead, correct, choiceIndex,
  };
}

/**
 * いま相手が押すか。経過時間と、主人公がめくったページ数（heroPage: 0 始まりの最奥）で決まる。
 * 主人公が速くめくると相手もつられて読み進むが、考える時間（AI_THINK_MIN）より早くは押さない。
 */
export function aiBuzzReady(plan, { elapsed = 0, heroPage = 0 } = {}) {
  if (!plan || !Number.isFinite(plan.buzzTime)) return false;
  const e = Number.isFinite(elapsed) ? elapsed : 0;
  const along = Math.max(0, Number(heroPage) || 0) * AI_PAGE_SEC * 0.5;
  return e >= plan.buzzTime || (e >= AI_THINK_MIN && e + along >= plan.buzzTime + AI_PAGE_SEC * 2);
}

/** 相手が間違えた後の回答。除外された選択肢は返さない */
export function aiAnswerAfterWrong({
  seed, questionNumber, strength, question, pagesRead, excluded = [], totalPages,
}) {
  const ex = Array.isArray(excluded) ? excluded : [];
  const r1 = hashUnit(seed, 'novel-ai-after', questionNumber, 1);
  const r2 = hashUnit(seed, 'novel-ai-after', questionNumber, 2);
  const answerOpen = !ex.includes(question.answer);
  const w = wrongChoices(question, ex);
  // totalPages を渡せば本当のページ数で確率を出す（省略時は従来どおり6ページ以上として扱う）
  const pr = Math.max(1, Number(pagesRead) || 1);
  const tp = Number(totalPages);
  const denom = Number.isFinite(tp) && tp >= 1 ? Math.max(tp, pr) : Math.max(pr, 6);
  const prob = aiCorrectProb(pr, denom, strength);
  if (answerOpen && (r1 < prob || !w.length)) return question.answer;
  if (!w.length) return [0, 1, 2, 3].find((i) => !ex.includes(i)) ?? 0;
  return w[Math.min(w.length - 1, Math.floor(r2 * w.length))];
}
