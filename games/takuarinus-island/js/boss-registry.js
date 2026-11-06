// ボスのレジストリ（ボス id → 部屋とミニゲームのモジュール）と、ボス id ⇔ ゲーム id の境界。
// 既存のボス id とゲーム id（puzzle / race / fps）は同じ。違う id が来ても名前の一部で対応づける。
import { BOSSES } from './bosses.js';
import * as puzzle from './bosses/puzzle.js';
import * as race from './bosses/race.js';
import * as fps from './bosses/fps.js';

const MODULES = Object.freeze({ puzzle, race, fps });
const KEYS = Object.keys(MODULES);

/** ボスのモジュールのキー → ゲーム id（アイテムの効果表で使う id） */
export const BOSS_GAME_IDS = Object.freeze({ puzzle: 'puzzle', race: 'race', fps: 'fps' });

function resolveKey(id) {
  if (typeof id !== 'string' || !id) return null;
  if (Object.prototype.hasOwnProperty.call(MODULES, id)) return id;
  return KEYS.find((k) => id.includes(k)) || null;
}

/** ボス id → {buildRoom, roomObstacles, ROOM_LAYOUT, createMinigame}。未登録は null */
export function getBossModule(id) {
  const k = resolveKey(id);
  return k ? MODULES[k] : null;
}

export function hasBossModule(id) {
  return getBossModule(id) !== null;
}

let idsCache = null;
let hubCache = null;
function idList() {
  if (!idsCache) idsCache = Object.freeze(BOSSES.map((b) => b.id).filter(hasBossModule));
  return idsCache;
}
function hubList() {
  // 部屋とミニゲームが登録されているボスの門は、少なくとも部屋まで入れる（gateOpen）
  if (!hubCache) {
    hubCache = Object.freeze(
      BOSSES.filter((b) => hasBossModule(b.id)).map((b) => (
        b.implemented === true || b.gateOpen === true ? b : Object.freeze({ ...b, gateOpen: true })
      )),
    );
  }
  return hubCache;
}

// 呼び出し側の互換のため、関数として呼んでも（hubBosses()）、配列として使っても（hubBosses.map）同じ一覧を返す
function listExport(getList) {
  const fn = () => getList();
  return new Proxy(fn, {
    get(target, key) {
      if (key === 'call' || key === 'apply' || key === 'bind') return Reflect.get(target, key);
      const list = getList();
      const v = Reflect.get(list, key);
      return typeof v === 'function' ? v.bind(list) : v;
    },
    has(target, key) {
      return key in getList();
    },
  });
}

/** ハブに門を出すボス（レジストリ順） */
export const hubBosses = listExport(hubList);
/** モジュールが登録されているボス id（レジストリ順） */
export const registeredBossIds = listExport(idList);

/** ボス id → ゲーム id（未知は null） */
export function gameIdForBoss(bossId) {
  const k = resolveKey(bossId);
  return k ? BOSS_GAME_IDS[k] : null;
}

/** gameIdForBoss の別名（main.js・room.js が使う） */
export const bossGameId = gameIdForBoss;

/** ゲーム id → ボス id（未知は null） */
export function bossIdForGame(gameId) {
  return idList().find((id) => gameIdForBoss(id) === gameId) ?? null;
}

/** クリア済みのボス id の配列 → クリア済みのゲーム id の配列（重複なし） */
export function clearedGameIds(bossIds) {
  const out = [];
  for (const id of Array.isArray(bossIds) ? bossIds : []) {
    const g = gameIdForBoss(id);
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}
