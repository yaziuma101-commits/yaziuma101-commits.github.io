// 進行状態（獲得したモヒカン）と保存。storage は {getItem,setItem,removeItem} 互換。
// タッチタッチの記録（touchTouch）も同じキーに載せる。旧データには無くてよい。
import { BOSSES } from './bosses.js';
import { TOUCH_AI_LEVELS } from './touch-ai.js';

export const STORAGE_KEY = 'takuarinus.save.v1';
const VERSION = 1;
const TT_LAST = ['win', 'lose', 'draw', 'uyamuya'];
const cnt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/** touchTouch の正規化。無い・壊れているときは null */
export function normalizeTouchTouch(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = {
    punches: cnt(v.punches),
    plays: cnt(v.plays),
    wins: cnt(v.wins),
    last: TT_LAST.includes(v.last) ? v.last : null,
  };
  if (TOUCH_AI_LEVELS.includes(v.level)) o.level = v.level;
  return Object.freeze(o);
}

function make(list, tt) {
  const o = { version: VERSION, mohicans: Object.freeze([...list]) };
  const t = normalizeTouchTouch(tt);
  if (t) o.touchTouch = t;
  return Object.freeze(o);
}

function isKnownMohican(id) {
  return BOSSES.some((b) => b.mohican.id === id);
}

export function createProgress() {
  return make([]);
}

export function hasMohican(state, id) {
  return !!state && Array.isArray(state.mohicans) && state.mohicans.includes(id);
}

export function mohicanCount(state) {
  return state && Array.isArray(state.mohicans) ? state.mohicans.length : 0;
}

export function collectMohican(state, mohicanId) {
  if (!isKnownMohican(mohicanId)) throw new Error(`未知のモヒカン: ${mohicanId}`);
  const list = state && Array.isArray(state.mohicans) ? state.mohicans : [];
  const tt = state ? state.touchTouch : undefined;
  if (list.includes(mohicanId)) return { state: make(list, tt), isNew: false };
  return { state: make([...list, mohicanId], tt), isNew: true };
}

export function isBossDefeated(state, bossId) {
  const boss = BOSSES.find((b) => b.id === bossId);
  return boss ? hasMohican(state, boss.mohican.id) : false;
}

export function getTouchTouch(state) {
  return normalizeTouchTouch(state && state.touchTouch);
}

export function serialize(state) {
  const out = { version: VERSION, mohicans: [...(state?.mohicans || [])] };
  const t = normalizeTouchTouch(state?.touchTouch);
  if (t) out.touchTouch = { ...t };
  return JSON.stringify(out);
}

export function deserialize(text) {
  try {
    if (typeof text !== 'string') return createProgress();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return createProgress();
    if (typeof data.version === 'number' && data.version !== VERSION) return createProgress();
    if (!Array.isArray(data.mohicans)) return createProgress();
    const out = [];
    for (const id of data.mohicans) {
      if (typeof id === 'string' && isKnownMohican(id) && !out.includes(id)) out.push(id);
    }
    return make(out, data.touchTouch);
  } catch {
    return createProgress();
  }
}

export function loadProgress(storage) {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (text == null) return createProgress();
    return deserialize(text);
  } catch {
    return createProgress();
  }
}

/** 保存。touchTouch は保存済みのもの（場面が直接書く）を優先して消さない */
export function saveProgress(storage, state) {
  let s = state;
  try {
    const text = typeof storage.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null;
    if (text != null) {
      const old = deserialize(text);
      if (old.touchTouch) s = { mohicans: state?.mohicans || [], touchTouch: old.touchTouch };
    }
  } catch {
    s = state;
  }
  try {
    storage.setItem(STORAGE_KEY, serialize(s));
    return true;
  } catch {
    return false;
  }
}

export function clearProgress(storage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // 握りつぶす
  }
}

/** touch-save.js の関数に渡せる形 { touchTouch } で読む（無ければ {}） */
export function loadTouchSave(storage) {
  const st = loadProgress(storage);
  return st.touchTouch ? { touchTouch: { ...st.touchTouch } } : {};
}

/** touch-save.js の結果（{ touchTouch }）を保存する。モヒカンはそのまま保つ */
export function storeTouchSave(storage, save) {
  const st = loadProgress(storage);
  try {
    storage.setItem(STORAGE_KEY, serialize({ mohicans: st.mohicans, touchTouch: save && save.touchTouch }));
    return true;
  } catch {
    return false;
  }
}
