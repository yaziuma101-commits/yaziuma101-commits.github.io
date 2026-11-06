// 周回・チェックポイント・順位の規則（three.js・DOM に依存しない）
export const TOTAL_LAPS = 3;

export function createRacer(id) {
  return { id, lap: 0, next: 1, checkpoints: 0, finished: false, finishTime: null };
}

const side = (p, g) => (p.x - g.x) * g.dx + (p.z - g.z) * g.dz;

/** 前進方向に線を跨いだときだけ true（逆走・幅の外・未到達は false） */
export function crossesGate(prev, cur, gate) {
  if (!prev || !cur || !gate) return false;
  const sp = side(prev, gate);
  const sc = side(cur, gate);
  if (!(sp < 0 && sc >= 0)) return false;
  const t = sp / (sp - sc);
  const ix = prev.x + (cur.x - prev.x) * t;
  const iz = prev.z + (cur.z - prev.z) * t;
  const lat = (ix - gate.x) * -gate.dz + (iz - gate.z) * gate.dx;
  return Math.abs(lat) <= gate.halfWidth;
}

/** 次のゲートだけを判定して進めた新しい racer を返す（引数は変更しない） */
export function stepRacer(racer, prev, cur, gates, time, totalLaps = TOTAL_LAPS) {
  const r = { ...racer };
  if (r.finished || !Array.isArray(gates) || gates.length === 0) return r;
  const n = gates.length;
  const idx = ((r.next % n) + n) % n;
  if (!crossesGate(prev, cur, gates[idx])) return r;
  r.checkpoints += 1;
  if (idx === 0) {
    r.lap += 1;
    r.next = 1 % n;
    if (r.lap >= totalLaps) {
      r.finished = true;
      r.finishTime = time;
    }
  } else {
    r.next = (idx + 1) % n;
  }
  return r;
}

export function distanceToNextGate(racer, pos, gates) {
  const g = gates[racer.next % gates.length];
  return Math.hypot(pos.x - g.x, pos.z - g.z);
}

/** 負なら a が前 */
export function compareProgress(a, b) {
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  if (a.finished && b.finished) return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
  if (a.lap !== b.lap) return b.lap - a.lap;
  if (a.checkpoints !== b.checkpoints) return b.checkpoints - a.checkpoints;
  return (a.distToNext ?? 0) - (b.distToNext ?? 0);
}

/** id の配列（1位から）。同値なら入力順 */
export function rankRacers(entries) {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((p, q) => compareProgress(p.e, q.e) || p.i - q.i)
    .map((x) => x.e.id);
}
