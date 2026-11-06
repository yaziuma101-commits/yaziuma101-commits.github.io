// 3問連続の進行（playing / level-clear / won）
import { createGame, tryMove, tryPull, undo, restart, isSolved } from './sokoban.js';
import { LEVELS } from './levels.js';

export function createSession(levels = LEVELS, opts = {}) {
  if (!Array.isArray(levels) || levels.length === 0) throw new Error('問題がありません');
  const session = { levels, index: 0, game: createGame(levels[0]), status: 'playing' };
  // アイテム効果（箱を2マス押せる）。持ち込みなしなら従来と同じ形のまま
  const pd = Math.floor(Number(opts && opts.pushDistance));
  if (Number.isFinite(pd) && pd > 1) session.pushDistance = pd;
  // 箱を引ける回数（3問を通して）
  const pl = Math.floor(Number(opts && opts.pullLeft));
  if (Number.isFinite(pl) && pl > 0) session.pullLeft = pl;
  return session;
}

export function moveSession(session, dir) {
  if (session.status !== 'playing') return 'ignored';
  const r = tryMove(session.game, dir, session.pushDistance);
  if (r !== 'blocked' && isSolved(session.game)) {
    session.status = session.index >= session.levels.length - 1 ? 'won' : 'level-clear';
  }
  return r;
}

/** 箱を手前に引く（残り回数 session.pullLeft を1つ使う）。引けなければ回数は減らない */
export function pullSession(session, dir) {
  if (session.status !== 'playing' || !(session.pullLeft > 0)) return 'ignored';
  const r = tryPull(session.game, dir);
  if (r === 'blocked') return r;
  session.pullLeft -= 1;
  if (isSolved(session.game)) {
    session.status = session.index >= session.levels.length - 1 ? 'won' : 'level-clear';
  }
  return r;
}

export function advanceSession(session) {
  if (session.status !== 'level-clear') return false;
  session.index += 1;
  session.game = createGame(session.levels[session.index]);
  session.status = 'playing';
  return true;
}

export function undoSession(session) {
  if (session.status !== 'playing') return false;
  return undo(session.game);
}

export function restartSession(session) {
  if (session.status !== 'playing') return false;
  restart(session.game);
  return true;
}
