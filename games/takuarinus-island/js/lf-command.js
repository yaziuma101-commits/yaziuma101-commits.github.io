// レバガチャファイターヌスの必殺技コマンド（試合ごとに種から作る）。three.js・DOM に依存しない。
import { makeRng, hashSeed } from './lf-rng.js';

export const SKILL_IDS = Object.freeze(['wave', 'rising', 'whirl']);
export const SKILL_NAMES = Object.freeze({ wave: 'モヒカン波動', rising: '昇天モヒカン拳', whirl: '旋風モヒ脚' });
/** 向き相対の方向（F=相手の方向）。上入力はジャンプと衝突するので使わない */
export const DIR_POOL = Object.freeze(['F', 'B', 'D', 'DF', 'DB']);

const ARROWS = Object.freeze({
  F: '→', B: '←', D: '↓', DF: '↘', DB: '↙', U: '↑', UF: '↗', UB: '↖', N: '・',
});
const MIRROR = Object.freeze({
  F: 'B', B: 'F', DF: 'DB', DB: 'DF', UF: 'UB', UB: 'UF',
});

function randomCommand(rng, skill) {
  const n = rng() < 0.5 ? 3 : 4;
  const dirs = [];
  while (dirs.length < n) {
    const d = DIR_POOL[Math.floor(rng() * DIR_POOL.length)];
    if (dirs.length && dirs[dirs.length - 1] === d) continue;
    dirs.push(d);
  }
  return { skill, dirs, button: rng() < 0.5 ? 'J' : 'K' };
}

const isSuffix = (a, b) => a.length <= b.length && a.every((d, i) => d === b[b.length - a.length + i]);
const sameCmd = (a, b) => !!a && !!b && a.button === b.button && Array.isArray(b.dirs)
  && a.dirs.length === b.dirs.length && a.dirs.every((d, i) => d === b.dirs[i]);

function validSet(list) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].dirs;
      const b = list[j].dirs;
      if (a[0] === b[0]) return false;
      if (isSuffix(a, b) || isSuffix(b, a)) return false;
    }
  }
  return true;
}

/** {wave, rising, whirl}。previous と同じものは作らない。keep したものはそのまま */
export function generateCommands(seed, { previous = null, keep = null } = {}) {
  const kept = {};
  for (const s of SKILL_IDS) {
    const k = keep && keep[s];
    if (k && Array.isArray(k.dirs)) kept[s] = { skill: s, dirs: [...k.dirs], button: k.button };
  }
  for (let salt = 0; salt < 64; salt++) {
    const rng = makeRng(hashSeed(seed, 'lf-cmd', salt));
    for (let attempt = 0; attempt < 200; attempt++) {
      const out = {};
      for (const s of SKILL_IDS) out[s] = kept[s] || randomCommand(rng, s);
      if (!validSet(SKILL_IDS.map((s) => out[s]))) continue;
      if (previous && SKILL_IDS.some((s) => !kept[s] && sameCmd(out[s], previous[s]))) continue;
      return out;
    }
  }
  return {
    wave: kept.wave || { skill: 'wave', dirs: ['D', 'DF', 'F'], button: 'J' },
    rising: kept.rising || { skill: 'rising', dirs: ['B', 'D', 'B'], button: 'K' },
    whirl: kept.whirl || { skill: 'whirl', dirs: ['F', 'D', 'DF'], button: 'K' },
  };
}

/** '↓ ↘ → ＋ J'。facing=-1 なら左右を反転 */
export function commandToText(cmd, facing = 1) {
  const dirs = cmd && Array.isArray(cmd.dirs) ? cmd.dirs : [];
  const tx = dirs.map((d) => ARROWS[facing < 0 ? (MIRROR[d] || d) : d] || '?');
  return `${tx.join(' ')} ＋ ${cmd ? cmd.button : ''}`;
}
