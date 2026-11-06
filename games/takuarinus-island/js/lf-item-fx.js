// レバガチャファイターヌスに持ち込んだアイテムの効果フラグ（three.js・DOM・Web Audio に依存しない）。
// item-table.js の lever-fighter の行の params（lfItem と効果のキー）か、アイテム id を受け取る。
import { SKILL_IDS } from './lf-command.js';
import { INPUT_WINDOW } from './lf-input.js';
import { foundSkills } from './lf-discovery.js';

const f = Object.freeze;

/** アイテム id → 効果（重複しないように1つずつ） */
export const LF_ITEM_EFFECTS = f({
  shiori: f({ revealFirst: true }),
  agemohawk: f({ misfireRate: 0.08 }),
  floppy: f({ keepFound: true }),
  movebox: f({ extraHp: 15 }),
  turbokart: f({ extraTime: 15 }),
  watergun: f({ hintBoost: 2 }),
  dekamohawk: f({ windowBonus: 0.2 }),
  nasukoma: f({ foeHpMinus: 10 }),
  fushigikendama: f({ revealRandom: true }),
  hachimaki: f({ extraHp: 10 }),
});

export const LF_EFFECT_KEYS = f([
  'revealFirst', 'revealRandom', 'keepFound', 'misfireRate', 'extraHp', 'extraTime', 'hintBoost', 'windowBonus', 'foeHpMinus',
]);

const num = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return f({
    revealFirst: !!r.revealFirst,
    revealRandom: !!r.revealRandom,
    keepFound: !!r.keepFound,
    misfireRate: num(r.misfireRate, 0, 0.5, 0),
    extraHp: num(r.extraHp, 0, 50, 0),
    extraTime: num(r.extraTime, 0, 60, 0),
    hintBoost: num(r.hintBoost, 1, 3, 1),
    windowBonus: num(r.windowBonus, 0, 0.4, 0),
    foeHpMinus: num(r.foeHpMinus, 0, 40, 0),
  });
}

/** アイテム id か、持ち込みの params（{lfItem, …}）→ 効果フラグ。無ければすべて既定 */
export function lfCarryEffects(item) {
  if (typeof item === 'string') return normalize(LF_ITEM_EFFECTS[item]);
  if (item && typeof item === 'object') {
    const base = typeof item.lfItem === 'string' ? (LF_ITEM_EFFECTS[item.lfItem] || {}) : {};
    const own = {};
    for (const k of LF_EFFECT_KEYS) if (item[k] !== undefined) own[k] = item[k];
    return normalize({ ...base, ...own });
  }
  return normalize(null);
}

/** コマンド入力の猶予（秒） */
export function lfInputWindow(fx) {
  const b = fx && fx.windowBonus > 0 ? fx.windowBonus : 0;
  return INPUT_WINDOW + b;
}

/** ヒントの光り具合を効果で強める（0..1） */
export function lfBoostHint(fx, level) {
  const v = Number(level);
  if (!(v > 0)) return 0;
  const k = fx && fx.hintBoost > 0 ? fx.hintBoost : 1;
  return Math.min(1, v * k);
}

/** 試合の始めから見つかっている技（持ち越し・しおり・ふしぎなけん玉） */
export function lfInitialFound(fx, carried = [], rng = Math.random) {
  const out = [];
  const add = (s) => {
    if (SKILL_IDS.includes(s) && !out.includes(s)) out.push(s);
  };
  for (const s of Array.isArray(carried) ? carried : []) add(s);
  if (fx && fx.revealFirst) add(SKILL_IDS[0]);
  if (fx && fx.revealRandom) {
    const rest = SKILL_IDS.filter((s) => !out.includes(s));
    if (rest.length) add(rest[Math.min(rest.length - 1, Math.floor(rng() * rest.length))]);
  }
  return out;
}

/** フロッピー：見つけた技のコマンドを次の試合に持ち越す keep（無ければ null） */
export function lfKeepCommands(fx, commands, discovery) {
  if (!fx || !fx.keepFound || !commands) return null;
  const keep = {};
  for (const s of foundSkills(discovery)) {
    if (commands[s]) keep[s] = commands[s];
  }
  return Object.keys(keep).length ? keep : null;
}
