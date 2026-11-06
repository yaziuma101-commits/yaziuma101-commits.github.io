// 自作駒と強さの保存・読込（文字列化だけ。localStorage には場面が書く）。
import { normalizeCustomDef, validateCustomDef } from './shogi-custom.js';

export const SHOGI_STORAGE_KEY = 'mohawk-shogi-v1';
export const SHOGI_LEVELS = Object.freeze(['easy', 'normal', 'hard']);
export const DEFAULT_SHOGI_LEVEL = 'normal';

const lvl = (v) => (SHOGI_LEVELS.includes(v) ? v : DEFAULT_SHOGI_LEVEL);
const arr = (a) => (Array.isArray(a) ? a.map((v) => ({ dx: v && v.dx, dy: v && v.dy })) : []);

export function serializeShogiSave({ def = null, level = DEFAULT_SHOGI_LEVEL } = {}) {
  const d = def && typeof def === 'object'
    ? { name: typeof def.name === 'string' ? def.name : '', cells: arr(def.cells), rays: arr(def.rays) }
    : null;
  return JSON.stringify({ v: 1, def: d, level: lvl(level) });
}

/** 読めるものだけ採用する。例外は投げない */
export function parseShogiSave(str) {
  const out = { def: null, level: DEFAULT_SHOGI_LEVEL };
  if (typeof str !== 'string' || !str) return out;
  let d;
  try {
    d = JSON.parse(str);
  } catch {
    return out;
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
  out.level = lvl(d.level);
  try {
    if (d.def && typeof d.def === 'object' && validateCustomDef(d.def).ok) out.def = normalizeCustomDef(d.def);
  } catch {
    out.def = null;
  }
  return out;
}
