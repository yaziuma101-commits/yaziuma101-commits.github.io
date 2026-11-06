// 倉庫番の規則（three.js・DOM に依存しない）
export const DIRECTIONS = Object.freeze({
  up: Object.freeze({ dx: 0, dy: -1 }),
  down: Object.freeze({ dx: 0, dy: 1 }),
  left: Object.freeze({ dx: -1, dy: 0 }),
  right: Object.freeze({ dx: 1, dy: 0 }),
});

const KNOWN = new Set(['#', ' ', '@', '+', '$', '*', '.']);

export function parseLevel(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('盤面が空です');
  for (const r of rows) if (typeof r !== 'string') throw new Error('盤面の行が文字列ではありません');
  const width = rows[0].length;
  const height = rows.length;
  if (width === 0) throw new Error('盤面の幅が 0 です');
  for (const r of rows) if (r.length !== width) throw new Error('行の長さが揃っていません');

  const walls = [];
  const goalMap = [];
  const goals = [];
  const boxes = [];
  const players = [];
  for (let y = 0; y < height; y++) {
    const wr = [];
    const gr = [];
    for (let x = 0; x < width; x++) {
      const c = rows[y][x];
      if (!KNOWN.has(c)) throw new Error(`未知の文字: '${c}' (${x},${y})`);
      wr.push(c === '#');
      const goal = c === '.' || c === '+' || c === '*';
      gr.push(goal);
      if (goal) goals.push({ x, y });
      if (c === '@' || c === '+') players.push({ x, y });
      if (c === '$' || c === '*') boxes.push({ x, y });
    }
    walls.push(wr);
    goalMap.push(gr);
  }
  if (players.length !== 1) throw new Error(`プレイヤーは1人だけです（${players.length}人）`);
  if (boxes.length !== goals.length) throw new Error(`箱(${boxes.length})とゴール(${goals.length})の数が違います`);
  return { width, height, walls, goals, goalMap, start: { player: players[0], boxes } };
}

export function isWall(level, x, y) {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return true;
  return level.walls[y][x];
}

export function isGoal(level, x, y) {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  return level.goalMap[y][x];
}

export function createGame(rows) {
  const level = parseLevel(rows);
  return {
    level,
    player: { ...level.start.player },
    boxes: level.start.boxes.map((b) => ({ ...b })),
    moves: 0,
    history: [],
  };
}

function boxIndexAt(game, x, y) {
  return game.boxes.findIndex((b) => b.x === x && b.y === y);
}

/** pushDistance（既定 1）: 箱を何マスまで押せるか。途中が壁・箱ならそこで止まる */
export function tryMove(game, dir, pushDistance = 1) {
  if (typeof dir !== 'string' || !Object.prototype.hasOwnProperty.call(DIRECTIONS, dir)) {
    throw new Error(`不正な方向: ${dir}`);
  }
  const pd = Number.isInteger(pushDistance) && pushDistance > 1 ? pushDistance : 1;
  const { dx, dy } = DIRECTIONS[dir];
  const nx = game.player.x + dx;
  const ny = game.player.y + dy;
  if (isWall(game.level, nx, ny)) return 'blocked';
  const bi = boxIndexAt(game, nx, ny);
  if (bi >= 0) {
    let bx = nx;
    let by = ny;
    let moved = 0;
    for (let k = 0; k < pd; k++) {
      const tx = bx + dx;
      const ty = by + dy;
      if (isWall(game.level, tx, ty) || boxIndexAt(game, tx, ty) >= 0) break;
      bx = tx;
      by = ty;
      moved += 1;
    }
    if (moved === 0) return 'blocked';
    game.history.push({ player: { ...game.player }, box: bi, boxFrom: { ...game.boxes[bi] } });
    game.boxes[bi] = { x: bx, y: by };
    game.player = { x: nx, y: ny };
    game.moves += 1;
    return 'push';
  }
  game.history.push({ player: { ...game.player }, box: -1, boxFrom: null });
  game.player = { x: nx, y: ny };
  game.moves += 1;
  return 'walk';
}

/**
 * 箱を手前に引く（持ち込みの「1回だけ箱を引ける」）。dir は主人公が向いている向き（箱がある側）。
 * 主人公は1マス下がり、箱は主人公がいたマスへ来る。下がれない・箱が無ければ 'blocked'
 */
export function tryPull(game, dir) {
  if (typeof dir !== 'string' || !Object.prototype.hasOwnProperty.call(DIRECTIONS, dir)) return 'blocked';
  const { dx, dy } = DIRECTIONS[dir];
  const bi = boxIndexAt(game, game.player.x + dx, game.player.y + dy);
  if (bi < 0) return 'blocked';
  const bx = game.player.x - dx;
  const by = game.player.y - dy;
  if (isWall(game.level, bx, by) || boxIndexAt(game, bx, by) >= 0) return 'blocked';
  game.history.push({ player: { ...game.player }, box: bi, boxFrom: { ...game.boxes[bi] } });
  game.boxes[bi] = { x: game.player.x, y: game.player.y };
  game.player = { x: bx, y: by };
  game.moves += 1;
  return 'pull';
}

export function undo(game) {
  const h = game.history.pop();
  if (!h) return false;
  game.player = { ...h.player };
  if (h.box >= 0) game.boxes[h.box] = { ...h.boxFrom };
  game.moves = Math.max(0, game.moves - 1);
  return true;
}

export function restart(game) {
  game.player = { ...game.level.start.player };
  game.boxes = game.level.start.boxes.map((b) => ({ ...b }));
  game.moves = 0;
  game.history = [];
}

export function boxesOnGoal(game) {
  return game.boxes.filter((b) => isGoal(game.level, b.x, b.y)).length;
}

export function isSolved(game) {
  return game.boxes.length > 0 && boxesOnGoal(game) === game.boxes.length;
}
