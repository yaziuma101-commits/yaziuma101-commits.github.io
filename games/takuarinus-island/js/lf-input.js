// レバガチャファイターヌスの入力履歴とコマンド判定。時間は秒。three.js・DOM に依存しない。

export const INPUT_WINDOW = 0.6;
const MAX_ENTRIES = 32;

/** キー状態 → 向き相対の方向 */
export function dirFromKeys({
  left = false, right = false, up = false, down = false,
} = {}, facing = 1) {
  let h = (right ? 1 : 0) - (left ? 1 : 0);
  const v = (up ? 1 : 0) - (down ? 1 : 0);
  if (facing < 0) h = -h;
  const hs = h > 0 ? 'F' : h < 0 ? 'B' : '';
  const vs = v > 0 ? 'U' : v < 0 ? 'D' : '';
  return vs + hs || 'N';
}

export function createInputBuffer() {
  return { entries: [] };
}

export function recordDirection(buf, dir, t) {
  const list = buf.entries;
  const last = list[list.length - 1];
  if (last && last.dir === dir) return;
  list.push({ dir, t });
  if (list.length > MAX_ENTRIES) list.shift();
}

export function recentDirs(buf, t, window = INPUT_WINDOW) {
  const from = t - window - 1e-9;
  const out = [];
  for (const e of buf.entries) {
    if (e.t < from || e.dir === 'N') continue;
    if (out.length && out[out.length - 1] === e.dir) continue;
    out.push(e.dir);
  }
  return out;
}

export function matchCommand(buf, cmd, t, window = INPUT_WINDOW) {
  if (!cmd || !Array.isArray(cmd.dirs) || !cmd.dirs.length) return false;
  const rd = recentDirs(buf, t, window);
  const n = cmd.dirs.length;
  if (rd.length < n) return false;
  return cmd.dirs.every((d, i) => rd[rd.length - n + i] === d);
}

/** ボタンとコマンドが一致した技 ID（複数なら最長）。なければ null */
export function detectSpecial(buf, commands, button, t, window = INPUT_WINDOW) {
  let best = null;
  let bestLen = 0;
  for (const [id, c] of Object.entries(commands || {})) {
    if (!c || c.button !== button) continue;
    if (matchCommand(buf, c, t, window) && c.dirs.length > bestLen) {
      best = c.skill || id;
      bestLen = c.dirs.length;
    }
  }
  return best;
}

/** 入力の末尾 k 個がコマンドの先頭 k 個と一致する最大の k */
export function commandProgress(buf, cmd, t, window = INPUT_WINDOW) {
  if (!cmd || !Array.isArray(cmd.dirs)) return 0;
  const rd = recentDirs(buf, t, window);
  for (let k = Math.min(cmd.dirs.length, rd.length); k >= 1; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (rd[rd.length - k + i] !== cmd.dirs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return k;
  }
  return 0;
}

/** ヒントの光り具合（0..1）。どのコマンドかは返さない */
export function hintLevel(buf, commands, t, window = INPUT_WINDOW) {
  let best = 0;
  for (const c of Object.values(commands || {})) {
    if (!c || !Array.isArray(c.dirs) || !c.dirs.length) continue;
    const k = commandProgress(buf, c, t, window);
    if (k >= 1) best = Math.max(best, k / c.dirs.length);
  }
  return best;
}

export function clearBuffer(buf) {
  buf.entries.length = 0;
}

/** ヒントの光り具合（0..1）→ 気合ゲージの不透明度。1つ目だけ合っているとき約 0.3 */
export function auraOpacity(level) {
  const v = Number(level);
  if (!(v > 0)) return 0;
  return Math.min(1, 0.12 + 0.6 * Math.min(1, v));
}
