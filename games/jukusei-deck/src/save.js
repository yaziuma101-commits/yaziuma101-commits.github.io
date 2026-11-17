// 保存（クリアの記録・難しさ・解放・図鑑・実績・毎日の挑戦）。画面に依らない。
// 読み書きは全部 try/catch。localStorage が無い・壊れている・満杯でも、保存しないだけで遊べる。
import CARDS from "../data/cards.js";
import ENEMIES from "../data/enemies.js";
import RELICS from "../data/relics.js";
import DECKS from "../data/decks.js";
import UNLOCKS from "../data/unlocks.js";
import ACHIEVEMENTS from "../data/achievements.js";
import ASCENSION from "../data/ascension.js";

export { UNLOCKS, ACHIEVEMENTS };
export const KEY = "jukusei-save-v1";
export const DAILY_ASC = 2;   // 毎日の挑戦の難しさ
const ASC_MAX = ASCENSION.length;

// 図鑑に載るもの（腐れ札は載せない。強化札は元の札として数える）
export const BOOK = {
  cards: CARDS.map(c => c.id).filter(id => id !== "kusare"),
  foes: ENEMIES.map(e => e.id),
  relics: RELICS.map(r => r.id),
};
const baseId = id => id.replace(/\+$/, "");

export function blank() {
  return {
    clears: 0, clearDecks: {}, maxAsc: -1, runs: 0,
    seen: { cards: [], foes: [], relics: [] },
    ach: [],
    stats: { combos: 0, ferments: 0, maxHit: 0, maxRelics: 0, potions: 0, dailyClears: 0 },
    daily: {},
  };
}
// 古い・壊れた中身でも、足りないところを既定で埋める
function fill(x) {
  const d = blank();
  if (!x || typeof x !== "object") return d;
  const num = (v, def) => (typeof v === "number" && isFinite(v) ? v : def);
  const ids = (a, ok) => (Array.isArray(a) ? a.filter(id => typeof id === "string" && ok.includes(id)) : []);
  d.clears = num(x.clears, 0); d.runs = num(x.runs, 0);
  d.maxAsc = Math.max(-1, Math.min(ASC_MAX, num(x.maxAsc, -1)));
  if (x.clearDecks && typeof x.clearDecks === "object") for (const [k, v] of Object.entries(x.clearDecks)) if (DECKS.some(t => t.id === k)) d.clearDecks[k] = num(v, 0);
  for (const k of Object.keys(BOOK)) d.seen[k] = ids(x.seen?.[k], BOOK[k]);
  d.ach = ids(x.ach, ACHIEVEMENTS.map(a => a.id));
  for (const k of Object.keys(d.stats)) d.stats[k] = num(x.stats?.[k], 0);
  if (x.daily && typeof x.daily === "object") for (const [k, v] of Object.entries(x.daily)) if (/^\d{8}$/.test(k) && v && typeof v === "object") d.daily[k] = { won: !!v.won, deck: String(v.deck || ""), wins: num(v.wins, 0) };
  return d;
}

// storage は localStorage と同じ形（getItem / setItem）。無ければ保存しない
export function load(storage = globalThis.localStorage) {
  try { return fill(JSON.parse(storage?.getItem(KEY) || "null")); } catch (e) { return blank(); }
}
export function store(sv, storage = globalThis.localStorage) {
  if (!storage) return false;
  try { storage.setItem(KEY, JSON.stringify(sv)); return true; } catch (e) { return false; }
}

// ---- 解放 ----
const meets = (sv, need) =>
  (need.clears == null || sv.clears >= need.clears) &&
  (need.asc == null || sv.maxAsc >= need.asc) &&
  (need.decks == null || Object.keys(sv.clearDecks).length >= need.decks) &&
  (need.ach == null || sv.ach.length >= need.ach);
export const isUnlocked = (sv, u) => meets(sv, u.need);
// まだ解放していない札・道具・型の id
export function locked(sv) {
  const out = { cards: [], relics: [], decks: [] };
  for (const u of UNLOCKS) if (!isUnlocked(sv, u)) for (const k of Object.keys(out)) out[k].push(...(u.what[k] || []));
  return out;
}
// その id を解放する条件（隠れているときの説明に使う）
export function unlockOf(id) { return UNLOCKS.find(u => Object.values(u.what).some(a => a.includes(id))) || null; }
// 選べる難しさの上限（クリアした段の次まで）
export const ascOpen = sv => Math.min(ASC_MAX, sv.maxAsc + 1);

// ---- 図鑑 ----
export function bookRate(sv) { return sv.seen.cards.length / BOOK.cards.length; }

// ---- 実績 ----
export function checkAch(sv) {
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (sv.ach.includes(a.id)) continue;
    let ok = false;
    try { ok = !!a.check({ ...sv.stats, clears: sv.clears, clearDecks: sv.clearDecks, maxAsc: sv.maxAsc }, DECKS.map(d => d.id), bookRate(sv)); } catch (e) { ok = false; }
    if (ok) { sv.ach.push(a.id); got.push(a.id); }
  }
  return got;
}

// ---- 毎日の挑戦（日付から種と型を作る。誰でも同じ日は同じ挑戦） ----
export function dayKey(date = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}
export function daily(date = new Date()) {
  const key = dayKey(date), seed = Number(key);
  // 型も種から（日付の数を混ぜて選ぶ。全部の型から。毎日の挑戦は解放に依らない）
  let h = seed >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h ^= h >>> 16;
  return { key, seed, deck: DECKS[(h >>> 0) % DECKS.length].id, asc: DAILY_ASC };
}

// ---- 挑戦の終わり：記録を足し、新しく取れた実績・解放・開いた段を返す ----
export function recordRun(sv, run) {
  const before = locked(sv), ascBefore = ascOpen(sv);
  const won = !!run.won;
  sv.runs++;
  for (const k of Object.keys(BOOK)) {
    const add = k === "cards" ? [...(run.book?.cards || []), ...run.deck] : run.book?.[k] || [];
    for (const raw of add) { const id = baseId(raw); if (BOOK[k].includes(id) && !sv.seen[k].includes(id)) sv.seen[k].push(id); }
  }
  const st = run.stats || {};
  sv.stats.combos += st.combos || 0;
  sv.stats.ferments += st.ferments || 0;
  sv.stats.potions += st.potions || 0;
  sv.stats.maxHit = Math.max(sv.stats.maxHit, st.maxHit || 0);
  sv.stats.maxRelics = Math.max(sv.stats.maxRelics, st.maxRelics || 0);
  if (won) {
    sv.clears++;
    sv.clearDecks[run.type] = Math.max(sv.clearDecks[run.type] ?? -1, run.asc || 0);
    if (!run.daily) sv.maxAsc = Math.max(sv.maxAsc, run.asc || 0);
  }
  if (run.daily) {
    const key = run.dailyKey || dayKey();
    const first = !sv.daily[key];
    if (first || (won && !sv.daily[key].won)) {
      if (won) sv.stats.dailyClears++;
      sv.daily[key] = { won, deck: run.type, wins: run.wins };
    }
  }
  const ach = checkAch(sv);
  // 実績で開いた解放もあるので、実績の後に比べる
  const after = locked(sv), opened = [];
  for (const k of Object.keys(before)) for (const id of before[k]) if (!after[k].includes(id)) opened.push({ kind: k, id });
  return { ach, opened, ascOpened: ascOpen(sv) > ascBefore ? ascOpen(sv) : null };
}
