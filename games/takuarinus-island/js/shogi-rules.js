// 将棋の規則（three.js・DOM・Web Audio に依存しない）。
// 盤は 9×9、座標 {x,y}（x: 0..8 左→右、y: 0..8 上→下）。先手 'b'（y が減る向きへ進む）、後手 'w'。
// 状態は不変。applyMove は新しい状態を返す。自作駒 C0 / C1 の動きは state.customs[0] / [1] の定義に従う。
const f = Object.freeze;
const N = 9;

export const BOARD_SIZE = N;
export const PROMOTABLE = f(['P', 'L', 'N', 'S', 'B', 'R']);
export const HAND_ORDER = f(['R', 'B', 'G', 'S', 'N', 'L', 'P', 'C0', 'C1']);
export const CUSTOM_TYPES = f(['C0', 'C1']);

export function opponent(side) {
  return side === 'b' ? 'w' : 'b';
}

const inB = (x, y) => x >= 0 && x < N && y >= 0 && y < N;

/** 成りゾーン（先手 y≤2、後手 y≥6） */
export function inPromotionZone(side, y) {
  return side === 'b' ? y <= 2 : y >= 6;
}

// ---- 駒の動き（先手から見た向き。dy が負で前進） ----
const spec = (steps, rays = []) => f({
  steps: f(steps.map((s) => f([s[0], s[1]]))),
  rays: f(rays.map((r) => f([r[0], r[1]]))),
});
const EMPTY = spec([], []);
const KING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const GOLD = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]];
const SILVER = [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]];
const DIAG = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const ORTH = [[0, -1], [-1, 0], [1, 0], [0, 1]];

const STD = {
  K: spec(KING),
  G: spec(GOLD),
  S: spec(SILVER),
  N: spec([[-1, -2], [1, -2]]),
  P: spec([[0, -1]]),
  L: spec([], [[0, -1]]),
  B: spec([], DIAG),
  R: spec([], ORTH),
};
const PROMO = {
  P: STD.G, L: STD.G, N: STD.G, S: STD.G, B: spec(ORTH, DIAG), R: spec(DIAG, ORTH),
};

const neg = (v) => (v ? -v : 0);
function orientSpec(s, side) {
  if (side === 'b') return s;
  return spec(s.steps.map(([x, y]) => [neg(x), neg(y)]), s.rays.map(([x, y]) => [neg(x), neg(y)]));
}

const STD_O = { b: {}, w: {} };
const PROMO_O = { b: {}, w: {} };
for (const side of ['b', 'w']) {
  for (const [k, v] of Object.entries(STD)) STD_O[side][k] = orientSpec(v, side);
  for (const [k, v] of Object.entries(PROMO)) PROMO_O[side][k] = orientSpec(v, side);
}

/** 自作駒の定義 → 動き（跳躍 cells は 5×5、ray は 8 方向。不正な要素は無視） */
function defSpec(def) {
  if (!def || typeof def !== 'object') return EMPTY;
  const steps = [];
  const rays = [];
  const seenS = new Set();
  const seenR = new Set();
  for (const c of Array.isArray(def.cells) ? def.cells : []) {
    const dx = Number(c && c.dx);
    const dy = Number(c && c.dy);
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) continue;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2 || (!dx && !dy)) continue;
    const k = `${dx},${dy}`;
    if (seenS.has(k)) continue;
    seenS.add(k);
    steps.push([dx, dy]);
  }
  for (const r of Array.isArray(def.rays) ? def.rays : []) {
    const dx = Number(r && r.dx);
    const dy = Number(r && r.dy);
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) continue;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) continue;
    const k = `${dx},${dy}`;
    if (seenR.has(k)) continue;
    seenR.add(k);
    rays.push([dx, dy]);
  }
  return spec(steps, rays);
}

const customCache = new WeakMap();
function customSpecs(customs) {
  if (!Array.isArray(customs)) return null;
  let c = customCache.get(customs);
  if (!c) {
    c = { b: [], w: [] };
    for (let i = 0; i < 2; i++) {
      const s = defSpec(customs[i]);
      c.b[i] = s;
      c.w[i] = orientSpec(s, 'w');
    }
    customCache.set(customs, c);
  }
  return c;
}

function pieceSpec(type, promoted, side, customs) {
  if (type === 'C0' || type === 'C1') {
    const c = customSpecs(customs);
    return c ? c[side][type === 'C0' ? 0 : 1] || EMPTY : EMPTY;
  }
  if (promoted && PROMO_O[side][type]) return PROMO_O[side][type];
  return STD_O[side][type] || EMPTY;
}

/** そのマスから動ける先が盤内に1つでもあるか（行き所のない駒の判定） */
function hasMoveFrom(sp, x, y) {
  for (const [dx, dy] of sp.steps) if (inB(x + dx, y + dy)) return true;
  for (const [dx, dy] of sp.rays) if (inB(x + dx, y + dy)) return true;
  return false;
}

// ---- 駒の実体（同じ駒は同じ凍結オブジェクト） ----
const pieceCache = new Map();
function mk(type, side, promoted = false) {
  const p = !!promoted && PROMOTABLE.includes(type);
  const k = `${side}${type}${p ? '+' : ''}`;
  let v = pieceCache.get(k);
  if (!v) {
    v = f({ type, side, promoted: p });
    pieceCache.set(k, v);
  }
  return v;
}

// ---- 状態 ----
function normHand(o) {
  const out = {};
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      const n = Math.floor(Number(v));
      if (n > 0) out[k] = n;
    }
  }
  return out;
}

function handStr(h) {
  return Object.keys(h).filter((k) => h[k] > 0).sort().map((k) => `${k}${h[k]}`).join('');
}

/** 局面キー（盤＋持ち駒＋手番） */
export function positionKey(state) {
  let s = '';
  for (const p of state.board) {
    s += p ? `${p.side === 'b' ? p.type : p.type.toLowerCase()}${p.promoted ? '+' : ''},` : '.';
  }
  return `${s}|${handStr(state.hands.b)}|${handStr(state.hands.w)}|${state.turn}`;
}

function finalize(board, hands, turn, customs, plies, prevPositions) {
  const s = {
    board: f(board),
    hands: f({ b: f(hands.b), w: f(hands.w) }),
    turn,
    customs,
    plies,
    positions: null,
  };
  const key = positionKey(s);
  const pos = { ...(prevPositions || {}) };
  pos[key] = (pos[key] || 0) + 1;
  s.positions = f(pos);
  return f(s);
}

/** 任意の局面を作る（テスト・持ち込み効果用） */
export function createState({
  pieces = [], hands = null, turn = 'b', customs = null,
} = {}) {
  const board = new Array(N * N).fill(null);
  for (const p of Array.isArray(pieces) ? pieces : []) {
    if (!p) continue;
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inB(x, y)) throw new RangeError(`盤の外: ${p.x},${p.y}`);
    if (p.side !== 'b' && p.side !== 'w') throw new Error(`手番が不正: ${p.side}`);
    if (typeof p.type !== 'string' || !p.type) throw new Error('駒の種類が無い');
    board[y * N + x] = mk(p.type, p.side, p.promoted);
  }
  const h = { b: normHand(hands && hands.b), w: normHand(hands && hands.w) };
  return finalize(board, h, turn === 'w' ? 'w' : 'b', Array.isArray(customs) ? customs : null, 0, null);
}

const BACK = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];

/** 本将棋の初期配置。customs を渡すと先手に C0、後手に C1 を1枚ずつ持たせる */
export function createInitialState({ customs = null } = {}) {
  const pieces = [];
  for (let x = 0; x < N; x++) {
    pieces.push(
      { type: BACK[x], side: 'w', x, y: 0 },
      { type: 'P', side: 'w', x, y: 2 },
      { type: BACK[x], side: 'b', x, y: 8 },
      { type: 'P', side: 'b', x, y: 6 },
    );
  }
  pieces.push(
    { type: 'R', side: 'w', x: 1, y: 1 },
    { type: 'B', side: 'w', x: 7, y: 1 },
    { type: 'B', side: 'b', x: 1, y: 7 },
    { type: 'R', side: 'b', x: 7, y: 7 },
  );
  const cs = Array.isArray(customs) ? customs : null;
  const hands = cs ? { b: { C0: 1 }, w: { C1: 1 } } : { b: {}, w: {} };
  return createState({
    pieces, hands, turn: 'b', customs: cs,
  });
}

export function pieceAt(state, x, y) {
  if (!state || !inB(x, y)) return null;
  return state.board[y * N + x] || null;
}

export function handCount(state, side, type) {
  const h = state && state.hands ? state.hands[side] : null;
  return (h && h[type]) || 0;
}

/** 持ち駒を表示順に [type, count] で */
export function handEntries(hand) {
  const h = hand && typeof hand === 'object' ? hand : {};
  const keys = [...HAND_ORDER.filter((k) => h[k] > 0), ...Object.keys(h).filter((k) => !HAND_ORDER.includes(k) && h[k] > 0)];
  return keys.map((k) => [k, h[k]]);
}

// ---- 利き・王手 ----
function attacked(board, x, y, by, customs) {
  for (let i = 0; i < N * N; i++) {
    const p = board[i];
    if (!p || p.side !== by) continue;
    const px = i % N;
    const py = (i - px) / N;
    const dx = x - px;
    const dy = y - py;
    if (!dx && !dy) continue;
    const sp = pieceSpec(p.type, p.promoted, by, customs);
    for (const [sx, sy] of sp.steps) if (sx === dx && sy === dy) return true;
    if (!sp.rays.length) continue;
    const ux = Math.sign(dx);
    const uy = Math.sign(dy);
    if (ux !== 0 && uy !== 0 && Math.abs(dx) !== Math.abs(dy)) continue;
    for (const [rx, ry] of sp.rays) {
      if (rx !== ux || ry !== uy) continue;
      let cx = px + rx;
      let cy = py + ry;
      let blocked = false;
      while (cx !== x || cy !== y) {
        if (board[cy * N + cx]) {
          blocked = true;
          break;
        }
        cx += rx;
        cy += ry;
      }
      if (!blocked) return true;
    }
  }
  return false;
}

function inCheckBoard(board, side, customs) {
  for (let i = 0; i < N * N; i++) {
    const p = board[i];
    if (p && p.side === side && p.type === 'K') {
      const x = i % N;
      return attacked(board, x, (i - x) / N, opponent(side), customs);
    }
  }
  return false; // 玉が無い局面では王手なし
}

/** side（省略で手番側）が王手されているか */
export function isInCheck(state, side = state.turn) {
  return inCheckBoard(state.board, side, state.customs);
}

/** 各マスの利きの数 { b: Uint8Array(81), w: Uint8Array(81) }（AI の評価用） */
export function attackCounts(state) {
  const { board, customs } = state;
  const out = { b: new Uint8Array(N * N), w: new Uint8Array(N * N) };
  for (let i = 0; i < N * N; i++) {
    const p = board[i];
    if (!p) continue;
    const x = i % N;
    const y = (i - x) / N;
    const arr = out[p.side];
    const sp = pieceSpec(p.type, p.promoted, p.side, customs);
    for (const [dx, dy] of sp.steps) if (inB(x + dx, y + dy)) arr[(y + dy) * N + x + dx] += 1;
    for (const [dx, dy] of sp.rays) {
      let tx = x + dx;
      let ty = y + dy;
      while (inB(tx, ty)) {
        arr[ty * N + tx] += 1;
        if (board[ty * N + tx]) break;
        tx += dx;
        ty += dy;
      }
    }
  }
  return out;
}

/** 盤上の駒を取る手（王手放置は調べない。AI の取り合いの延長用）。成れるなら成る手だけ */
export function captureMoves(state) {
  const all = [];
  boardMoves(state.board, state.turn, state.customs, all);
  const caps = all.filter((m) => state.board[m.to.y * N + m.to.x]);
  return caps.filter((m) => m.promote || !caps.some((o) => o.promote
    && o.from.x === m.from.x && o.from.y === m.from.y && o.to.x === m.to.x && o.to.y === m.to.y));
}

/** 盤と持ち駒を差し替えた局面（手番・手数はそのまま。持ち込み効果用） */
export function withPosition(state, { board = state.board, hands = state.hands } = {}) {
  return finalize(
    board.slice(),
    { b: normHand(hands && hands.b), w: normHand(hands && hands.w) },
    state.turn,
    state.customs,
    state.plies || 0,
    state.positions,
  );
}

// ---- 手の生成 ----
const mv = (fx, fy, tx, ty, promote) => f({
  from: f({ x: fx, y: fy }), to: f({ x: tx, y: ty }), drop: null, promote: !!promote,
});

function boardMoves(board, side, customs, out) {
  for (let i = 0; i < N * N; i++) {
    const p = board[i];
    if (!p || p.side !== side) continue;
    const x = i % N;
    const y = (i - x) / N;
    const sp = pieceSpec(p.type, p.promoted, side, customs);
    const canPro = !p.promoted && PROMOTABLE.includes(p.type);
    const add = (tx, ty) => {
      if (canPro && (inPromotionZone(side, y) || inPromotionZone(side, ty))) {
        const lastRank = side === 'b' ? ty === 0 : ty === N - 1;
        if (hasMoveFrom(sp, tx, ty) || !lastRank) out.push(mv(x, y, tx, ty, false));
        out.push(mv(x, y, tx, ty, true));
      } else if (hasMoveFrom(sp, tx, ty)) {
        out.push(mv(x, y, tx, ty, false));
      }
    };
    for (const [dx, dy] of sp.steps) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inB(tx, ty)) continue;
      const t = board[ty * N + tx];
      if (t && t.side === side) continue;
      add(tx, ty);
    }
    for (const [dx, dy] of sp.rays) {
      let tx = x + dx;
      let ty = y + dy;
      while (inB(tx, ty)) {
        const t = board[ty * N + tx];
        if (t && t.side === side) break;
        add(tx, ty);
        if (t) break;
        tx += dx;
        ty += dy;
      }
    }
  }
}

function dropMoves(state, side, out) {
  const { board, customs } = state;
  for (const [type, count] of handEntries(state.hands[side])) {
    if (!(count > 0)) continue;
    const sp = pieceSpec(type, false, side, customs);
    let pawnFiles = null;
    if (type === 'P') {
      pawnFiles = new Array(N).fill(false);
      for (let i = 0; i < N * N; i++) {
        const p = board[i];
        if (p && p.side === side && p.type === 'P' && !p.promoted) pawnFiles[i % N] = true;
      }
    }
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (board[y * N + x]) continue;
        if (pawnFiles && pawnFiles[x]) continue;
        if (!hasMoveFrom(sp, x, y)) continue;
        out.push(f({
          from: null, to: f({ x, y }), drop: type, promote: false,
        }));
      }
    }
  }
}

function boardAfter(board, move, side) {
  const b = board.slice();
  const ti = move.to.y * N + move.to.x;
  if (move.drop) {
    b[ti] = mk(move.drop, side, false);
  } else {
    const fi = move.from.y * N + move.from.x;
    const p = b[fi];
    b[fi] = null;
    b[ti] = move.promote ? mk(p.type, side, true) : p;
  }
  return b;
}

const legalCache = new WeakMap();

/** 手番側の合法手（王手放置・二歩・行き所のない駒を除く。打ち歩詰めは除かない） */
export function legalMoves(state) {
  if (!state || !state.board) return [];
  const hit = legalCache.get(state);
  if (hit) return hit.slice();
  const side = state.turn;
  const { board, customs } = state;
  const pseudo = [];
  boardMoves(board, side, customs, pseudo);
  dropMoves(state, side, pseudo);
  const out = f(pseudo.filter((m) => !inCheckBoard(boardAfter(board, m, side), side, customs)));
  legalCache.set(state, out);
  return out.slice();
}

/** 同じ手か（成り・打つ駒・座標を比べる） */
export function sameMove(a, b) {
  if (!a || !b || !a.to || !b.to) return false;
  const ad = a.drop || null;
  const bd = b.drop || null;
  if (ad !== bd) return false;
  if (!!a.promote !== !!b.promote) return false;
  if (a.to.x !== b.to.x || a.to.y !== b.to.y) return false;
  if (ad) return !a.from && !b.from;
  return !!a.from && !!b.from && a.from.x === b.from.x && a.from.y === b.from.y;
}

/** 検査なしで手を進める（合法と分かっている手だけに使う） */
export function applyMoveUnchecked(state, move) {
  const side = state.turn;
  const board = state.board.slice();
  const hands = { b: { ...state.hands.b }, w: { ...state.hands.w } };
  const ti = move.to.y * N + move.to.x;
  if (move.drop) {
    board[ti] = mk(move.drop, side, false);
    const h = hands[side];
    if ((h[move.drop] || 0) <= 1) delete h[move.drop];
    else h[move.drop] -= 1;
  } else {
    const fi = move.from.y * N + move.from.x;
    const p = board[fi];
    const cap = board[ti];
    if (cap) hands[side][cap.type] = (hands[side][cap.type] || 0) + 1;
    board[fi] = null;
    board[ti] = move.promote ? mk(p.type, side, true) : p;
  }
  return finalize(board, hands, opponent(side), state.customs, (state.plies || 0) + 1, state.positions);
}

/** 手を指す。合法手でなければ Error */
export function applyMove(state, move) {
  if (!state || !move || !move.to) throw new Error('手が不正です');
  const m = legalMoves(state).find((l) => sameMove(l, move));
  if (!m) throw new Error('指せない手です');
  return applyMoveUnchecked(state, m);
}

/** 対局の状態 { kind: ongoing|checkmate|nomoves|repetition, winner, inCheck } */
export function gameStatus(state) {
  const inCheck = isInCheck(state, state.turn);
  const seen = state.positions ? state.positions[positionKey(state)] || 0 : 0;
  if (seen >= 4) return { kind: 'repetition', winner: null, inCheck };
  if (!legalMoves(state).length) {
    return { kind: inCheck ? 'checkmate' : 'nomoves', winner: opponent(state.turn), inCheck };
  }
  return { kind: 'ongoing', winner: null, inCheck };
}
