// タイトルの選択肢の見た目の規則（three.js・DOM・Web Audio に依存しない）。
// どの項目が「選んでいる項目」かを、項目の印（クラス・aria・フォーカス）から決める。
import { normalizeSillyLevel } from './silly-rules.js';

/** 選択中を表すよくあるクラス名 */
export const KNOWN_SELECTED_CLASSES = Object.freeze([
  'selected', 'active', 'is-selected', 'is-active', 'current', 'sel', 'on', 'focus', 'focused', 'highlight', 'chosen',
]);
/** 選択の目印にならないクラス名（1項目だけに付いていても選択とみなさない） */
export const IGNORED_CLASSES = Object.freeze([
  'disabled', 'is-disabled', 'locked', 'hidden', 'first', 'last',
]);
/** この仕組みが自分で付けるクラスの接頭辞（判定には使わない） */
export const OWN_PREFIX = 'tm-';
export const POYON_MS = 520;
export const CONFIRM_KEYS = Object.freeze(['Enter', 'NumpadEnter', 'Space']);

export function isConfirmKey(code) {
  return CONFIRM_KEYS.includes(code);
}

/** おふざけ度 0 は揺らさない（カーソルと決定のポヨンは残す） */
export function menuMotion(level) {
  return normalizeSillyLevel(level) === 0 ? 'calm' : 'wobble';
}

function classesOf(it) {
  const list = it && Array.isArray(it.classes) ? it.classes : [];
  return [...new Set(list.filter((c) => typeof c === 'string' && c && !c.startsWith(OWN_PREFIX)))];
}

/**
 * 選んでいる項目の添字。items は {classes, aria, innerMarked, focused} の配列。
 * 1) aria・よくあるクラス（項目か中の要素）→ 2) 1項目だけに付いたクラス → 3) フォーカス → 4) 先頭。
 * 項目が無ければ -1。
 */
export function pickSelectedIndex(items) {
  if (!Array.isArray(items) || items.length === 0) return -1;
  const marked = items.findIndex((it) => !!it && (
    it.aria === true || it.innerMarked === true || classesOf(it).some((c) => KNOWN_SELECTED_CLASSES.includes(c))
  ));
  if (marked >= 0) return marked;
  if (items.length > 1) {
    const count = new Map();
    for (const it of items) {
      for (const c of classesOf(it)) count.set(c, (count.get(c) || 0) + 1);
    }
    const singles = items.map((it) => classesOf(it)
      .filter((c) => count.get(c) === 1 && !IGNORED_CLASSES.includes(c)).length);
    const max = Math.max(...singles);
    if (max > 0 && singles.filter((s) => s === max).length === 1) return singles.indexOf(max);
  }
  const f = items.findIndex((it) => !!it && it.focused === true);
  if (f >= 0) return f;
  return 0;
}
