// ポーズメニューの規則（three.js・DOM に依存しない）
import { ROOM_SCENES } from './game-catalog.js';

export const RESUME_ID = 'resume';

export function closedPause() {
  return Object.freeze({ open: false, sel: 0, items: Object.freeze([]) });
}

/** ポーズを開く。先頭は必ず「再開」。extra はシーンが足す項目 {id,label} */
export function openPause(extra = []) {
  const items = [{ id: RESUME_ID, label: '再開' }];
  for (const e of Array.isArray(extra) ? extra : []) {
    if (!e || typeof e.id !== 'string' || typeof e.label !== 'string') continue;
    if (items.some((i) => i.id === e.id)) continue;
    items.push({ id: e.id, label: e.label });
  }
  return Object.freeze({ open: true, sel: 0, items: Object.freeze(items) });
}

/** ポーズを開いてよいか（タイトルなど pausable=false、会話中、画面切り替え中は不可） */
export function canPause({ pausable = true, dialogOpen = false, transitioning = false } = {}) {
  return pausable !== false && !dialogOpen && !transitioning;
}

/** 1フレーム分のキー入力 {up,down,enter,esc} を処理。{state, action(項目 id か null)} */
export function pauseInput(state, keys = {}) {
  if (!state || !state.open) return { state: state || closedPause(), action: null };
  if (keys.esc) return { state: closedPause(), action: RESUME_ID };
  const n = state.items.length;
  let sel = state.sel;
  if (keys.up) sel = (sel + n - 1) % n;
  if (keys.down) sel = (sel + 1) % n;
  if (keys.enter) return { state: closedPause(), action: state.items[sel].id };
  if (sel === state.sel) return { state, action: null };
  return { state: Object.freeze({ ...state, sel }), action: null };
}

// ---- ポーズの標準項目（どの場面でも並ぶ） ----
export const PAUSE_HOWTO_ID = 'howto';
export const PAUSE_VOLUME_ID = 'volume';
export const PAUSE_HUB_ID = 'go-hub';
export const PAUSE_SILLY_ID = 'silly';

/** 音量の行（効果音・音楽） */
export const VOLUME_CHANNELS = Object.freeze([
  Object.freeze({ id: 'sfx', label: '効果音' }),
  Object.freeze({ id: 'music', label: '音楽' }),
]);

/** 「あそびかた」「音量」「ハブへ戻る」。ハブにいるときは「ハブへ戻る」を出さない */
export function standardPauseItems({ canGoHub = true } = {}) {
  const items = [
    { id: PAUSE_HOWTO_ID, label: 'あそびかた' },
    { id: PAUSE_VOLUME_ID, label: '音量' },
  ];
  if (canGoHub) items.push({ id: PAUSE_HUB_ID, label: 'ハブへ戻る' });
  return items;
}

/** ポーズを閉じずにパネルの中で開く項目か */
export function isPauseSubPanel(id) {
  return id === PAUSE_HOWTO_ID || id === PAUSE_VOLUME_ID || id === PAUSE_SILLY_ID;
}

/** 音量を delta だけ動かす（0〜10 の整数に丸める） */
export function volumeAdjust(value, delta) {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0;
  return Math.max(0, Math.min(10, Math.round(v + d)));
}

/** 「おふざけ度」の項目（標準項目のあとに足す） */
export function sillyPauseItem() {
  return { id: PAUSE_SILLY_ID, label: 'おふざけ度' };
}

// ---- 戻る項目は場面ごとに1つだけ ----
export const PAUSE_GALLERY_ID = 'go-gallery';
/** どの場面からでもタイトルへ（依頼者の指定 2026-11-04）。場面ごとに1つの「戻る項目」には数えず、その直前に置く */
export const PAUSE_TITLE_ID = 'go-title';
/** 部屋の登録（readyRooms の形：ゲームID → 場面名）から、館のゲームの場面名の一覧を作る */
export function galleryRoomScenesFrom(readyRooms) {
  const out = [];
  const add = (v) => {
    const s = typeof v === 'string' ? v : (v && typeof v.scene === 'string' ? v.scene : null);
    if (s && !out.includes(s)) out.push(s);
  };
  if (readyRooms && typeof readyRooms === 'object') {
    if (readyRooms instanceof Map) readyRooms.forEach(add);
    else if (!Array.isArray(readyRooms)) Object.values(readyRooms).forEach(add);
  }
  if (!out.includes('construction')) out.push('construction');
  return out;
}
/** 絵画の館から入る部屋（戻る先は館）。部屋の登録から作るので、ゲームを足すと自動で入る */
export const GALLERY_ROOM_SCENES = Object.freeze(galleryRoomScenesFrom(ROOM_SCENES));
/** ボスのミニゲームの場面 */
export const BOSS_GAME_SCENES = Object.freeze(['minigame']);

/** 「〜へ戻る」の項目か（名前で判定） */
export function isBackItem(item) {
  if (item && item.id === PAUSE_TITLE_ID) return false;
  return !!item && typeof item.label === 'string' && /(戻る|もどる)/.test(item.label);
}

/**
 * ポーズに並べる項目（「再開」は openPause が先頭に足す）。
 * 場面の項目 → あそびかた → 音量 → おふざけ度 → 戻る項目（場面が持っていないときだけ）。
 * 戻る項目はどの場面でも1つだけ：ボスのミニゲームは「やめてハブへ戻る」、館の部屋は「館に戻る」。
 */
export function scenePauseItems(sceneName, extra = [], { galleryScenes = null } = {}) {
  const gallery = Array.isArray(galleryScenes)
    ? [...new Set([...galleryScenes, ...GALLERY_ROOM_SCENES])]
    : GALLERY_ROOM_SCENES;
  const list = [];
  let back = null;
  for (const e of Array.isArray(extra) ? extra : []) {
    if (!e || typeof e.id !== 'string' || typeof e.label !== 'string') continue;
    if (isBackItem(e)) {
      if (back) continue; // 場面が2つ持っていても1つだけ
      if (gallery.includes(sceneName) && e.id === PAUSE_HUB_ID) continue; // 館のゲームにハブへは出さない
      // 場面が持つ戻る項目も最後に置く（吹っ飛ばし・レースだけ2番目にあり、並びがゲームごとに違った）
      back = { id: e.id, label: e.label };
      continue;
    }
    list.push({ id: e.id, label: e.label });
  }
  if (!back) {
    if (gallery.includes(sceneName)) back = { id: PAUSE_GALLERY_ID, label: '館に戻る' };
    else if (BOSS_GAME_SCENES.includes(sceneName)) back = { id: PAUSE_HUB_ID, label: 'やめてハブへ戻る' };
    else if (sceneName !== 'hub' && sceneName !== 'title') back = { id: PAUSE_HUB_ID, label: 'ハブへ戻る' };
  }
  const items = [
    ...list,
    ...standardPauseItems({ canGoHub: false }),
    sillyPauseItem(),
  ];
  if (sceneName !== 'title') items.push({ id: PAUSE_TITLE_ID, label: 'タイトルに戻る' });
  if (back) items.push(back);
  return items;
}

/** おふざけ度の表示名（0〜3） */
export const SILLY_LEVEL_NAMES = Object.freeze(['0 しずか', '1 ちょっと', '2 ふつう', '3 カオス']);

/** おふざけ度を delta だけ動かす（0〜3 の整数に丸める） */
export function sillyAdjust(level, delta) {
  const v = typeof level === 'number' && Number.isFinite(level) ? level : 2;
  const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0;
  return Math.max(0, Math.min(3, Math.round(v + d)));
}

const sec = (title, rows) => Object.freeze({
  title, rows: Object.freeze(rows.map((r) => Object.freeze([...r]))),
});

/** あそびかた（全場面の操作の一覧）。[キー, 説明] */
export const HOWTO_SECTIONS = Object.freeze([
  sec('ぜんぶの場面', [
    ['Esc', 'ポーズ（あそびかた・音量・ハブへ戻る）'],
    ['M', '消音の切り替え'],
    ['Enter / E', '決定・会話を進める'],
  ]),
  sec('ハブ・番長の部屋', [
    ['WASD / 矢印', '移動'],
    ['Shift', 'ダッシュ'],
    ['Space', 'ジャンプ'],
    ['Q / E・ドラッグ', 'カメラを回す'],
    ['E / Enter', '仲間・番長と話す'],
    ['台座の前で E', 'モヒカンを付け替える'],
    ['先輩アリヌス', 'モヒカンが3つそろったら話しかけよう'],
  ]),
  sec('パズル番長（倉庫番）', [
    ['WASD / 矢印', '移動・箱を押す（引けない）'],
    ['Z', '1手戻す'],
    ['R', '最初から'],
  ]),
  sec('レース番長（カートレース）', [
    ['W / ↑', 'アクセル'],
    ['S / ↓', 'ブレーキ・バック'],
    ['A D / ← →', 'ハンドル'],
    ['F', '近くのカートへ飛び移ってパンチ'],
    ['E', 'カートに乗る'],
  ]),
  sec('FPS番長（水鉄砲）', [
    ['クリック / J', '視点を固定・水鉄砲を撃つ（J は固定しなくても撃てる）'],
    ['マウス / ← →', 'ねらう'],
    ['WASD', '移動'],
    ['R', '水を補充'],
  ]),
  sec('真っ暗ソウル（ねこアリヌスの絵）', [
    ['WASD', '移動'],
    ['Shift', '走る（足音が遠くまで響く）'],
    ['C', 'しゃがむ（ゆっくり・足音が小さい）'],
    ['マウス / ← →', '見回す（クリックで視点を固定）'],
    ['F', '懐中電灯のオン・オフ（光を向けると気づかれる）'],
    ['E', '調べる・拾う・使う／隠れる・出る'],
    ['Tab', 'メモ帳'],
  ]),
]);

/** 項目を直接選ぶ（マウスクリック用） */
export function choosePause(state, index) {
  if (!state || !state.open || !Number.isInteger(index) || index < 0 || index >= state.items.length) {
    return { state: state || closedPause(), action: null };
  }
  return { state: closedPause(), action: state.items[index].id };
}
