// タッチタッチのふざけた割り込みの予定（three.js・DOM・Web Audio に依存しない）。
import { createRng } from './mini-rng.js';

export const INTERRUPT_KINDS = Object.freeze(['tangle', 'sneeze', 'dance']);

/** [{at, seconds, kind}] を at の昇順で返す。おふざけ度 0 は空 */
export function planInterrupts({ seed = 0, silliness = 0 } = {}) {
  const s = Math.max(0, Math.min(3, Math.floor(Number(silliness) || 0)));
  if (s === 0) return [];
  const rng = createRng(seed);
  let n = 1;
  if (s === 2) n = rng.chance(0.5) ? 2 : 1;
  else if (s === 3) n = 2;
  const out = [];
  let prev = -Infinity;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(5, prev + 10);
    const hi = 50 - (n - 1 - i) * 10;
    const at = rng.range(lo, Math.max(lo, hi));
    const seconds = rng.range(1, 2);
    const kind = rng.pick(INTERRUPT_KINDS);
    out.push({ at, seconds, kind });
    prev = at;
  }
  return out;
}
