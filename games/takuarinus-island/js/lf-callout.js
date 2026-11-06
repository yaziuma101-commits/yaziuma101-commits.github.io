// 必殺技を出したときの表示（技の名前とコマンド）。three.js・DOM・Web Audio に依存しない。
// 真剣な文面だけを作る（擬音は出さない）。
import { SKILL_IDS, SKILL_NAMES, commandToText } from './lf-command.js';

/** 初めて出した（見た）ときの表示秒数と、2回目以降の短い表示秒数 */
export const CALLOUT_SEC = 2.0;
export const CALLOUT_SHORT_SEC = 1.1;

/**
 * 技の表示の中身。facing は矢印の向き（+1: 右向き、-1: 左向き。主人公の今の向き）。
 * 相手（who: 'foe'）のときは技の名前だけで、コマンドの文字は作らない（相手のコマンドは分からない）。
 * 返り値 {who, skill, name, command, text, sec, first}。未知の技は null。
 */
export function specialCallout(skill, commands, facing = 1, { who = 'hero', first = false } = {}) {
  if (!SKILL_IDS.includes(skill)) return null;
  const foe = who === 'foe';
  const cmd = commands && commands[skill];
  const name = foe ? `${SKILL_NAMES[skill]}！` : SKILL_NAMES[skill];
  const command = !foe && cmd && Array.isArray(cmd.dirs) ? commandToText(cmd, facing < 0 ? -1 : 1) : '';
  return {
    who: foe ? 'foe' : 'hero',
    skill,
    name,
    command,
    text: command ? `${name}　${command}` : name,
    sec: first ? CALLOUT_SEC : CALLOUT_SHORT_SEC,
    first: !!first,
  };
}

/** 相手（ムキムキヌス）の必殺技のコマンド。その試合の主人公のコマンドと同じ（写しを返す） */
export function opponentCommands(heroCommands) {
  const out = {};
  for (const s of SKILL_IDS) {
    const c = heroCommands && heroCommands[s];
    if (c && Array.isArray(c.dirs)) out[s] = { skill: s, dirs: [...c.dirs], button: c.button };
  }
  return out;
}
