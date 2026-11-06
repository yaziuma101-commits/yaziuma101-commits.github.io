// 「待った」つきの対局履歴（three.js・DOM に依存しない）。session は不変。
import { applyMove } from './shogi-rules.js';

export const DEFAULT_UNDO_LIMIT = 3;

export function createSession(state, { undoLimit = DEFAULT_UNDO_LIMIT } = {}) {
  const n = Math.floor(Number(undoLimit));
  return Object.freeze({
    state,
    history: Object.freeze([]),
    undosLeft: Number.isFinite(n) && n >= 0 ? n : DEFAULT_UNDO_LIMIT,
    plies: 0,
  });
}

export function playMove(session, move) {
  const next = applyMove(session.state, move);
  return Object.freeze({
    ...session,
    state: next,
    history: Object.freeze([...session.history, session.state]),
    plies: session.plies + 1,
  });
}

/** 「待った」できるか（回数が残っていて、戻る履歴がある） */
export function canUndo(session) {
  if (!session || !session.state) return false;
  const back = session.state.turn === 'b' ? 2 : 1;
  return session.undosLeft > 0 && Array.isArray(session.history) && session.history.length >= back;
}

/** 主人公（先手）の手番まで巻き戻す */
export function undo(session) {
  const back = session.state.turn === 'b' ? 2 : 1;
  const h = session.history;
  if (!(session.undosLeft > 0) || h.length < back) return { ok: false, session };
  return {
    ok: true,
    session: Object.freeze({
      ...session,
      state: h[h.length - back],
      history: Object.freeze(h.slice(0, h.length - back)),
      plies: session.plies - back,
      undosLeft: session.undosLeft - 1,
    }),
  };
}
