// 小説一夜漬けチキンレース：早押しの得点と1問の状態遷移（three.js・DOM・Web Audio に依存しない）。
// すべて元の状態を変えず、新しい状態を返す。

export const PAGE_SEC = 1.2;
export const WRONG_PENALTY = 3;

/** 早押しの得点。page は 1 始まりの「そこまでに読んだ本文ページ数」 */
export function buzzPoints(page, total) {
  const n = Math.floor(Number(total));
  if (!(n > 1)) return 10;
  const p = Math.min(n, Math.max(1, Math.floor(Number(page)) || 1));
  return Math.round(10 - (8 * (p - 1)) / (n - 1));
}

export function otherSide(who) {
  return who === 'hero' ? 'ally' : 'hero';
}

export function createQuestionState() {
  return {
    phase: 'reading',
    buzzer: null,
    buzzPage: null,
    excluded: [],
    secondChance: false,
    delta: { hero: 0, ally: 0 },
    winner: null,
    outcome: null,
  };
}

const copy = (s) => ({ ...s, excluded: [...s.excluded], delta: { ...s.delta } });

/** 早押し。reading のときだけ有効 */
export function buzzIn(state, who, page) {
  if (!state || state.phase !== 'reading') return state;
  if (who !== 'hero' && who !== 'ally') return state;
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  return {
    ...copy(state), phase: 'answering', buzzer: who, buzzPage: p,
  };
}

/** 回答。不正解の1人目は減点して相手の番、2人目は減点して終わり */
export function answerQuestion(state, question, choiceIndex, total) {
  if (!state || state.phase !== 'answering' || !question) return state;
  const n = Array.isArray(question.choices) ? question.choices.length : 4;
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= n) return state;
  if (state.excluded.includes(choiceIndex)) return state;
  const who = state.buzzer;
  const next = copy(state);
  if (choiceIndex === question.answer) {
    next.delta[who] += buzzPoints(state.buzzPage, total);
    return {
      ...next, phase: 'done', winner: who, outcome: 'correct',
    };
  }
  next.delta[who] -= WRONG_PENALTY;
  next.excluded.push(choiceIndex);
  if (!state.secondChance) {
    return { ...next, buzzer: otherSide(who), secondChance: true };
  }
  return {
    ...next, phase: 'done', winner: null, outcome: 'bothWrong',
  };
}

/** 時間切れ（誰も押さなかった）。reading のときだけ */
export function timeoutQuestion(state) {
  if (!state || state.phase !== 'reading') return state;
  return {
    ...copy(state), phase: 'done', winner: null, outcome: 'timeout',
  };
}

/** 終わった問題の一言（場面の表示用）。終わっていなければ null */
export function outcomeText(state) {
  if (!state || state.phase !== 'done') return null;
  if (state.outcome === 'correct') {
    return state.winner === 'hero'
      ? { text: `正解！ +${state.delta.hero}点`, tone: 'good' }
      : { text: 'タバコヌスが正解！', tone: 'bad' };
  }
  if (state.outcome === 'bothWrong') return { text: 'どちらも不正解…', tone: 'bad' };
  if (state.outcome === 'timeout') return { text: '時間切れ！', tone: '' };
  return null;
}
