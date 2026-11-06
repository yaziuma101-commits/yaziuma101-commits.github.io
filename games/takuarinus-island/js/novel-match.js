// 小説一夜漬けチキンレース：2本6問の勝負（three.js・DOM・Web Audio に依存しない）。
import { STORIES } from './novel-stories.js';
import { hashUnit } from './kendama-tricks.js';
import { clampNovelStrength } from './novel-ai.js';

export const QUESTIONS_PER_STORY = 3;
export const TOTAL_QUESTIONS = 6;

/** 重複なしで2本を種から選ぶ */
export function pickStories(seed, stories = STORIES) {
  const list = Array.isArray(stories) ? stories : [];
  const n = list.length;
  if (n < 2) return list.slice(0, 2);
  const i = Math.min(n - 1, Math.floor(hashUnit(seed, 'novel-pick', 0) * n));
  let j = Math.min(n - 2, Math.floor(hashUnit(seed, 'novel-pick', 1) * (n - 1)));
  if (j >= i) j += 1;
  return [list[i], list[j]];
}

export function createNovelMatch({ seed, strength = 2, stories = STORIES } = {}) {
  const s = Number.isFinite(Number(seed)) ? Math.floor(Number(seed)) : 0;
  return {
    seed: s,
    strength: clampNovelStrength(strength),
    stories: pickStories(s, stories),
    questionIndex: 0,
    scores: { hero: 0, ally: 0 },
    results: [],
  };
}

export function isFinished(match) {
  return !match || match.questionIndex >= TOTAL_QUESTIONS;
}

export function currentQuestion(match) {
  if (isFinished(match)) return null;
  const qi = match.questionIndex;
  const storyIndex = Math.floor(qi / QUESTIONS_PER_STORY);
  const indexInStory = qi % QUESTIONS_PER_STORY;
  const story = match.stories[storyIndex];
  if (!story) return null;
  return {
    story, storyIndex, indexInStory, number: qi + 1, question: story.questions[indexInStory],
  };
}

/** 終わった問題の得点を足して次へ。終わっていなければ変えない */
export function applyQuestionResult(match, qstate) {
  if (isFinished(match) || !qstate || qstate.phase !== 'done') return match;
  const d = qstate.delta || { hero: 0, ally: 0 };
  return {
    ...match,
    stories: [...match.stories],
    questionIndex: match.questionIndex + 1,
    scores: { hero: match.scores.hero + (d.hero || 0), ally: match.scores.ally + (d.ally || 0) },
    results: [...match.results, {
      number: match.questionIndex + 1,
      outcome: qstate.outcome ?? null,
      winner: qstate.winner ?? null,
      delta: { hero: d.hero || 0, ally: d.ally || 0 },
    }],
  };
}

export function novelResult(match) {
  if (!match || !isFinished(match)) return null;
  const { hero, ally } = match.scores;
  if (hero > ally) return 'win';
  if (hero < ally) return 'lose';
  return 'draw';
}

const RESULT_TITLES = Object.freeze({ win: '勝ち！', lose: '負け…', draw: '引き分け' });

/** 勝負の結果画面の中身（文字だけ。HTML は場面が作る） */
export function novelResultView(match, extra = []) {
  const r = novelResult(match) || 'draw';
  const s = (match && match.scores) || { hero: 0, ally: 0 };
  const titles = (match && Array.isArray(match.stories) ? match.stories : [])
    .map((st) => `『${st && st.title ? st.title : '？'}』`).join('と');
  const marks = (match && Array.isArray(match.results) ? match.results : []).map((x) => {
    let m = '△';
    if (x.winner === 'hero') m = '○';
    else if (x.winner === 'ally') m = '×';
    return `${x.number}問${m}`;
  }).join('　');
  return {
    title: RESULT_TITLES[r],
    tone: r === 'win' ? 'good' : r === 'lose' ? 'bad' : '',
    result: r,
    lines: [
      `あなた ${s.hero}点 − ${s.ally}点 タバコヌス（小説2本・${TOTAL_QUESTIONS}問の合計）`,
      `読んだ小説：${titles}`,
      `（○あなたが正解　×タバコヌスが正解　△どちらも取れず）${marks}`,
      ...(Array.isArray(extra) ? extra.filter((t) => typeof t === 'string' && t) : []),
    ],
    choices: [{ id: 'again', label: 'もう一度' }, { id: 'gallery', label: '館に戻る' }],
  };
}
