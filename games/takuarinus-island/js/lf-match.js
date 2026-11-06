// ラウンド・3本勝負・タイマー。新しいオブジェクトを返す。three.js・DOM に依存しない。

export function createMatch({ roundsToWin = 2, roundTime = 60 } = {}) {
  const target = Number.isFinite(roundsToWin) && roundsToWin > 0 ? Math.floor(roundsToWin) : 2;
  const time = Number.isFinite(roundTime) && roundTime > 0 ? roundTime : 60;
  return {
    round: 1, wins: { player: 0, enemy: 0 }, target, timeLeft: time, roundTime: time, phase: 'intro', winner: null, results: [],
  };
}

export function beginFight(m) {
  return { ...m, phase: 'fight' };
}

export function tickTimer(m, dt) {
  if (m.phase !== 'fight') return m;
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  return { ...m, timeLeft: Math.max(0, m.timeLeft - d) };
}

export function judgeRound({ playerHp, enemyHp, timeLeft }) {
  const p = Number(playerHp) || 0;
  const e = Number(enemyHp) || 0;
  if (p <= 0 && e <= 0) return { winner: 'draw', reason: 'ko' };
  if (p <= 0) return { winner: 'enemy', reason: 'ko' };
  if (e <= 0) return { winner: 'player', reason: 'ko' };
  if (timeLeft > 0) return null;
  if (p > e) return { winner: 'player', reason: 'time' };
  if (e > p) return { winner: 'enemy', reason: 'time' };
  return { winner: 'draw', reason: 'time' };
}

export function finishRound(m, judgement) {
  if (!judgement) return m;
  const wins = { ...m.wins };
  if (judgement.winner === 'player' || judgement.winner === 'draw') wins.player += 1;
  if (judgement.winner === 'enemy' || judgement.winner === 'draw') wins.enemy += 1;
  const results = [...m.results, { round: m.round, ...judgement }];
  const p = wins.player >= m.target;
  const e = wins.enemy >= m.target;
  if (p && e) return { ...m, wins, results, target: m.target + 1, phase: 'roundEnd' };
  if (p || e) return { ...m, wins, results, phase: 'matchEnd', winner: p ? 'player' : 'enemy' };
  return { ...m, wins, results, phase: 'roundEnd' };
}

export function nextRound(m) {
  return { ...m, round: m.round + 1, timeLeft: m.roundTime || 60, phase: 'intro' };
}

const REASON_TEXT = Object.freeze({ ko: 'K.O.', time: '時間切れ' });

/** 試合の結果画面の中身（結果パネルの形）。extra は追加の行 */
export function lfResultView(m, { heroName = 'タクアリヌス', foeName = 'ムキムキヌス', extra = [] } = {}) {
  const win = m.winner === 'player';
  const lose = m.winner === 'enemy';
  const nameOf = (w) => (w === 'player' ? heroName : w === 'enemy' ? foeName : '引き分け');
  const rounds = (Array.isArray(m.results) ? m.results : [])
    .map((r) => `第${r.round}ラウンド　${nameOf(r.winner)}（${REASON_TEXT[r.reason] || ''}）`);
  return {
    title: win ? '勝利' : lose ? '敗北' : '決着つかず',
    tone: win ? 'good' : lose ? 'bad' : '',
    result: win ? 'win' : lose ? 'lose' : 'draw',
    lines: [
      `${heroName} ${m.wins.player} − ${m.wins.enemy} ${foeName}`,
      ...rounds,
      ...(Array.isArray(extra) ? extra.filter((s) => typeof s === 'string' && s) : []),
    ],
    choices: [{ id: 'again', label: 'もう一度' }, { id: 'gallery', label: '館に戻る' }],
  };
}

export function roundLabel(m) {
  const last = m.target - 1;
  if (last >= 1 && m.wins.player === last && m.wins.enemy === last) return '最終ラウンド';
  return `第${m.round}ラウンド`;
}
