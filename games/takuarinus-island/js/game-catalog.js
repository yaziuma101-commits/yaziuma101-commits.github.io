// ゲームの一覧と、絵からの行き先（three.js・DOM に依存しない）。
// 行き先は main.js の readyRooms に登録された部屋があればその場面へ、無ければ工事中の部屋へ。
import { ENTRANCE_PAINTINGS } from './gallery-data.js';

const f = Object.freeze;

export const BOSS_GAME_LIST = f(['puzzle', 'race', 'fps']);
/** 部屋のあるゲーム → main.js の場面名 */
export const ROOM_SCENES = f({
  'mohi-touch': 'touch', blowaway: 'stack', 'super-shogi': 'shogi', kendama: 'kendama', 'novel-chicken': 'novel',
  'find-file': 'findfile', 'lever-fighter': 'leverfighter', 'dark-soul': 'darksoul', kaiju: 'kaijuBattle',
});

const g = (id, title, status) => f({
  id, title, status, kind: BOSS_GAME_LIST.includes(id) ? 'boss' : 'room',
});

export const GAME_CATALOG = f([
  g('puzzle', 'パズル番長の倉庫番', 'ready'),
  g('race', 'レース番長のカートレース', 'ready'),
  g('fps', 'FPS番長の水鉄砲バトル', 'ready'),
  g('mohi-touch', 'モヒカンタッチタッチ', 'ready'),
  g('blowaway', '積み上げたもの吹っ飛ばし', 'ready'),
  g('super-shogi', 'スーパー将棋', 'ready'),
  g('kendama', 'けん玉ケンケン', 'ready'),
  g('novel-chicken', '小説一夜漬けチキンレース', 'ready'),
  g('find-file', 'ファイルを見つけろ', 'ready'),
  g('lever-fighter', 'レバガチャファイターヌス', 'ready'),
  g('dark-soul', '真っ暗ソウル', 'ready'),
  g('kaiju', '怪獣大決戦', 'ready'),
]);

export function gameById(id) {
  return GAME_CATALOG.find((x) => x.id === id);
}

const SIGN_LINES = ['ただいま工事中', '職人が昼寝中', 'モヒカンを積み直し中', '油を温め中', 'ぬ゛'];
const signs = [...SIGN_LINES];
signs['mohi-touch'] = 'モヒカンを磨き中';
signs.blowaway = '油を温め中';
/** 工事中の看板の文句（配列。ゲームID のキーでも引ける） */
export const CONSTRUCTION_SIGNS = f(signs);

function signFor(id) {
  if (typeof id === 'string' && typeof CONSTRUCTION_SIGNS[id] === 'string' && Number.isNaN(Number(id))) {
    return CONSTRUCTION_SIGNS[id];
  }
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SIGN_LINES[h % SIGN_LINES.length];
}

/** 工事中の部屋の中身（ボスのゲーム・未知のゲームは null） */
export function constructionRoom(gameId) {
  const game = gameById(gameId);
  if (!game || game.kind === 'boss') return null;
  return f({
    gameId: game.id, title: game.title, sign: signFor(game.id), exit: f({ to: 'gallery' }),
  });
}

/** 絵の id かゲームの id → ゲーム id（どちらでもなければ null） */
function gameIdOf(target) {
  if (typeof target === 'string') {
    const p = ENTRANCE_PAINTINGS.find((x) => x && x.id === target);
    if (p) return p.gameId;
    return gameById(target) ? target : null;
  }
  if (target && typeof target === 'object') {
    const id = typeof target.gameId === 'string' ? target.gameId : target.id;
    return typeof id === 'string' ? gameIdOf(id) : null;
  }
  return null;
}

/** readyRooms に登録された場面名。登録が無ければ null */
function roomFor(id, rr) {
  if (!rr || typeof rr !== 'object') return null;
  const def = ROOM_SCENES[id] || id;
  if (rr instanceof Set) return rr.has(id) ? def : null;
  if (Array.isArray(rr)) return rr.includes(id) ? def : null;
  let v;
  if (rr instanceof Map) {
    if (!rr.has(id)) return null;
    v = rr.get(id);
  } else {
    if (!Object.prototype.hasOwnProperty.call(rr, id)) return null;
    v = rr[id];
  }
  if (typeof v === 'string' && v) return v;
  if (v && typeof v === 'object' && typeof v.scene === 'string') return v.scene;
  return v ? def : null;
}

/**
 * 絵（またはゲームID）の行き先。readyRooms は main.js の登録（省略可）。
 * 工事中: {kind:'construction', gameId, title} ／ 部屋: {kind:'game', gameId, room, scene, to, title, …} ／ 飾り・未知: null
 * どの部屋に繋ぐかは readyRooms だけで決める。readyRooms が無い・登録が無ければ工事中。
 */
export function resolveDestination(target, readyRooms) {
  const id = gameIdOf(target);
  const game = id ? gameById(id) : null;
  if (!game) return null;
  if (game.kind === 'boss') {
    return f({
      kind: 'boss', gameId: game.id, bossId: game.id, title: game.title,
    });
  }
  const room = roomFor(game.id, readyRooms);
  if (room) {
    return f({
      kind: 'game',
      gameId: game.id,
      room,
      title: game.title,
      scene: room,
      to: room,
      params: f({ gameId: game.id }),
    });
  }
  return f({ kind: 'construction', gameId: game.id, title: game.title });
}
