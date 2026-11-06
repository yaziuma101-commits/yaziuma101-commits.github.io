// 積み上げ吹っ飛ばしの3ラウンド（three.js・DOM に依存しない）。
export function createStackMatch({ rounds = 3 } = {}) {
  const n = Math.max(1, Math.floor(Number(rounds) || 3));
  return {
    rounds: n,
    round: 1,
    turns: Array.from({ length: n }, () => ({ hero: null, rival: null })),
    totals: { hero: 0, rival: 0 },
    over: false,
    result: null,
  };
}

/** 次に記録する側（そのラウンドは主人公 → 相手の順）。終了後は null */
export function currentTurn(match) {
  if (!match || match.over) return null;
  const t = match.turns[match.round - 1];
  if (!t) return null;
  if (t.hero === null) return 'hero';
  if (t.rival === null) return 'rival';
  return null;
}

export function recordTurn(match, who, score) {
  if (who !== 'hero' && who !== 'rival') throw new Error(`不明な側: ${who}`);
  if (match.over) throw new Error('試合は終わっている');
  const turn = match.turns[match.round - 1];
  if (turn[who] !== null) throw new Error('同じラウンドで二重に記録');
  const s = Number(score) || 0;
  turn[who] = s;
  match.totals[who] += s;
  if (turn.hero !== null && turn.rival !== null) {
    if (match.round >= match.rounds) {
      match.over = true;
      const { hero, rival } = match.totals;
      match.result = hero > rival ? 'win' : hero < rival ? 'lose' : 'draw';
    } else {
      match.round += 1;
    }
  }
  return match;
}
