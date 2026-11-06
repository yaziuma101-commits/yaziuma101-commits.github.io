// 「見つけた」必殺技の管理と、暴発の抽選。three.js・DOM に依存しない。
import { SKILL_IDS, SKILL_NAMES, commandToText } from './lf-command.js';

export function createDiscovery(initial = []) {
  const found = [];
  for (const s of Array.isArray(initial) ? initial : []) {
    if (SKILL_IDS.includes(s) && !found.includes(s)) found.push(s);
  }
  return { found, seen: [] };
}

/**
 * 相手が出した技は記録しない（相手のコマンドは分からないまま。一覧は「？？？」のまま）。
 * 以前の呼び出しとの互換のため残す。常に false
 */
export function markSeen(d, skill) {
  void d;
  void skill;
  return false;
}

/** 「見た」は使わない（常に false） */
export function isSeen(d, skill) {
  void d;
  void skill;
  return false;
}

/** 新しく見つけたなら true */
export function markFound(d, skill) {
  if (!SKILL_IDS.includes(skill) || d.found.includes(skill)) return false;
  d.found.push(skill);
  return true;
}

export function isFound(d, skill) {
  return !!d && d.found.includes(skill);
}

export function foundSkills(d) {
  return d ? [...d.found] : [];
}

/** 技の一覧の中身。主人公が自分で出した（見つけた）技だけコマンド（右向き基準）が入り、未発見は text: null */
export function movesView(commands, d) {
  return SKILL_IDS.map((s) => {
    const found = isFound(d, s);
    const c = commands && commands[s];
    return {
      skill: s,
      name: SKILL_NAMES[s],
      found,
      seen: false,
      status: found ? 'found' : 'unknown',
      text: found && c ? commandToText(c, 1) : null,
      seenText: null,
    };
  });
}

/** まだ見つけていない技のコマンドだけ（ヒントの光はこれで計る） */
export function undiscoveredCommands(commands, d) {
  const out = {};
  for (const s of SKILL_IDS) {
    if (commands && commands[s] && !isFound(d, s)) out[s] = commands[s];
  }
  return out;
}

/** 見つけたときの帯の文面（真剣な文面） */
export function discoveryNotice(skill) {
  return `必殺技を発見：${SKILL_NAMES[skill] || ''}`;
}

/** 確率 rate で技のどれか、そうでなければ null */
export function rollMisfire(rng, rate) {
  if (!(rate > 0)) return null;
  if (!(rng() < rate)) return null;
  return SKILL_IDS[Math.min(SKILL_IDS.length - 1, Math.floor(rng() * SKILL_IDS.length))];
}
