// 倉庫番の BFS ソルバ（状態 = プレイヤー位置 + 箱集合）
// テスト専用：場面からは使わない。問題（levels.js）が必ず解けることをテストで確かめるために置く
import { parseLevel, DIRECTIONS } from './sokoban.js';

const ORDER = ['up', 'down', 'left', 'right'];

export function solve(rows, { maxStates = 300000 } = {}) {
  const lv = parseLevel(rows);
  const W = lv.width;
  const H = lv.height;
  const wall = (x, y) => x < 0 || y < 0 || x >= W || y >= H || lv.walls[y][x];
  const goalIdx = (i) => lv.goalMap[Math.floor(i / W)][i % W];
  const done = (boxes) => boxes.every(goalIdx);
  const key = (s) => `${s.p}:${s.boxes.join(',')}`;
  const byNum = (a, b) => a - b;

  const start = {
    p: lv.start.player.y * W + lv.start.player.x,
    boxes: lv.start.boxes.map((b) => b.y * W + b.x).sort(byNum),
  };
  if (done(start.boxes)) return [];

  const states = [start];
  const parent = [-1];
  const via = [null];
  const seen = new Set([key(start)]);

  for (let head = 0; head < states.length; head++) {
    const s = states[head];
    const px = s.p % W;
    const py = (s.p - px) / W;
    for (const d of ORDER) {
      const { dx, dy } = DIRECTIONS[d];
      const nx = px + dx;
      const ny = py + dy;
      if (wall(nx, ny)) continue;
      const np = ny * W + nx;
      let boxes = s.boxes;
      const bi = boxes.indexOf(np);
      if (bi >= 0) {
        const bx = nx + dx;
        const by = ny + dy;
        if (wall(bx, by)) continue;
        const nb = by * W + bx;
        if (boxes.includes(nb)) continue;
        boxes = boxes.slice();
        boxes[bi] = nb;
        boxes.sort(byNum);
      }
      const ns = { p: np, boxes };
      const k = key(ns);
      if (seen.has(k)) continue;
      seen.add(k);
      states.push(ns);
      parent.push(head);
      via.push(d);
      if (bi >= 0 && done(boxes)) {
        const path = [];
        let idx = states.length - 1;
        while (parent[idx] !== -1) {
          path.push(via[idx]);
          idx = parent[idx];
        }
        return path.reverse();
      }
      if (states.length > maxStates) return null;
    }
  }
  return null;
}
