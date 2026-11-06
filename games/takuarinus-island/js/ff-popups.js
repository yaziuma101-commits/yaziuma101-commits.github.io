// 「ファイルを見つけろ」のお邪魔の小窓（広告・警告）。three.js・DOM に依存しない。
// 出る時刻・種類・位置は種で決まる。同時に出るのは最大 POPUP_LIMIT 枚。どの小窓も必ず閉じられる。
import { makeRng, hashSeed } from './ff-rng.js';

const f = Object.freeze;

export const POPUP_LIMIT = 4;
/** × が逃げる回数の上限（それ以上は逃げない） */
export const POPUP_MAX_DODGE = 2;
/** おふざけ度 → 次の小窓までの秒数の範囲（度 0 は出ない） */
export const POPUP_INTERVAL = f({ 1: f([30, 50]), 2: f([15, 30]), 3: f([9, 18]) });
/** 閉じ方のひと手間：× が小さい／× が逃げる／「本当に閉じますか？」 */
export const POPUP_TRICKS = f(['tinyX', 'dodgeX', 'confirm']);
/** 1回戦ぶんの予定を作る長さ（秒） */
export const POPUP_SPAN_SEC = 300;
export const CONFIRM_TEXT = '本当に閉じますか？';

export const AD_TEXTS = f([
  'おめでとうございます！ あなたは 100万人目の モヒカン です！ 今すぐクリック！',
  'とうふ 1丁 0円！（送料 98万円）',
  'このモヒカン、あなたに似合いすぎ',
  'あなたのパソコンが 3倍速く！ ※とうふが 3倍 冷えます',
  '今だけ！ モヒカン用ワックス 1年分 プレゼント',
  'となりの とうふアリヌスが あなたを 待っています',
]);

export const WARN_TEXTS = f([
  'ディスクの空き容量が とうふ 1丁分 しかありません',
  'モヒカンウイルスを 3件 発見しました（駆除しますか？）',
  'あと 10秒で 再起動します',
  'メモリが ぬ゛ になりました。続けるには OK を押してください',
  'とうふの賞味期限が 切れています',
]);

const AD_TITLES = f(['おしらせ！！', 'スペシャルなご案内', '大当たり！']);
const WARN_TITLES = f(['モヒカンOS 98 の警告', 'システムの警告', 'ディスクの警告']);

const levelOf = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 0;
};

function makeSpec(rng, kind = null) {
  const k = kind || (rng.chance(0.55) ? 'ad' : 'warn');
  const ad = k === 'ad';
  const grow = ad && rng.chance(0.5);
  return {
    kind: k,
    title: rng.pick(ad ? AD_TITLES : WARN_TITLES),
    text: rng.pick(ad ? AD_TEXTS : WARN_TEXTS),
    trick: rng.pick(POPUP_TRICKS),
    x: rng.int(6, 50),
    y: rng.int(4, 44),
    grow,
    blink: ad && !grow,
  };
}

/** 小窓の予定表 [{t, popup}]（t は回が始まってからの秒、昇順） */
export function popupSchedule(seed, level, durationSec = POPUP_SPAN_SEC) {
  const lv = levelOf(level);
  if (lv <= 0) return [];
  const [lo, hi] = POPUP_INTERVAL[lv];
  const rng = makeRng(hashSeed(seed, 'ff-popups', lv));
  const end = Number(durationSec);
  const out = [];
  let t = lo * 0.5 + rng.next() * (hi - lo) * 0.5;
  while (Number.isFinite(end) && t <= end) {
    out.push({ t, popup: makeSpec(rng) });
    t += lo + rng.next() * (hi - lo);
  }
  return out;
}

/** 開いている小窓の管理。list() の並びが重なりの順（末尾が手前） */
export function createPopupManager(seed = 0) {
  const items = [];
  let serial = 0;
  let spawnN = 0;
  const find = (id) => items.find((p) => p.id === id) || null;

  function add(spec, extra = {}) {
    const s = spec || {};
    const p = {
      id: `pop${++serial}`,
      kind: s.kind === 'warn' ? 'warn' : (s.kind === 'confirm' ? 'confirm' : 'ad'),
      title: String(s.title || ''),
      text: String(s.text || ''),
      trick: POPUP_TRICKS.includes(s.trick) ? s.trick : 'tinyX',
      x: Number.isFinite(s.x) ? s.x : 30,
      y: Number.isFinite(s.y) ? s.y : 20,
      grow: !!s.grow,
      blink: !!s.blink,
      dodged: 0,
      parentId: null,
      childId: null,
      ...extra,
    };
    items.push(p);
    return p;
  }

  function remove(p, res) {
    const i = items.indexOf(p);
    if (i < 0) return;
    items.splice(i, 1);
    res.closed++;
    if (p.childId) {
      const c = find(p.childId);
      if (c) remove(c, res);
    }
    if (p.parentId) {
      const par = find(p.parentId);
      if (par && par.childId === p.id) par.childId = null;
    }
  }

  function askConfirm(p, res) {
    if (p.childId && find(p.childId)) return;
    // もう出せないときは、そのまま閉じる（閉じられない小窓は作らない）
    if (items.length >= POPUP_LIMIT) {
      remove(p, res);
      return;
    }
    const c = add({
      kind: 'confirm', title: '確認', text: CONFIRM_TEXT, trick: 'tinyX', x: Math.min(60, p.x + 6), y: Math.min(52, p.y + 10),
    }, { parentId: p.id });
    p.childId = c.id;
    res.spawned++;
  }

  return {
    open(spec) {
      if (items.length >= POPUP_LIMIT) return null;
      return { ...add(spec) };
    },
    /** 操作：'dodge'（× に近づいた）'x' 'close' 'ok' 'body' 'yes' 'no' */
    press(id, act) {
      const res = { closed: 0, spawned: 0, moved: false };
      const p = find(id);
      if (!p) return res;
      if (p.kind === 'confirm') {
        if (act === 'yes') {
          const par = p.parentId ? find(p.parentId) : null;
          remove(p, res);
          if (par) remove(par, res);
        } else if (act === 'no' || act === 'x' || act === 'close') {
          remove(p, res);
        }
        return res;
      }
      if (act === 'dodge') {
        if (p.trick === 'dodgeX' && p.dodged < POPUP_MAX_DODGE) {
          p.dodged++;
          res.moved = true;
        }
        return res;
      }
      if (act === 'x' || act === 'close' || act === 'ok') {
        if (p.trick === 'confirm') askConfirm(p, res);
        else remove(p, res);
        return res;
      }
      if (act === 'body' && p.kind === 'ad' && items.length < POPUP_LIMIT) {
        const spec = makeSpec(makeRng(hashSeed(seed, 'ff-pop-spawn', spawnN++)), 'ad');
        add({
          ...spec, trick: 'tinyX', x: Math.min(56, p.x + 8), y: Math.min(48, p.y + 6),
        });
        res.spawned++;
      }
      return res;
    },
    list: () => items.map((p) => ({ ...p })),
    count: () => items.length,
    clear() {
      items.length = 0;
    },
  };
}

/** 閉じる手順の次の1手 {id, act}（何も無ければ null） */
export function nextCloseStep(list) {
  const arr = Array.isArray(list) ? list : [];
  const c = arr.find((p) => p && p.kind === 'confirm');
  if (c) return { id: c.id, act: 'yes' };
  const p = arr[0];
  if (!p) return null;
  return { id: p.id, act: p.kind === 'warn' ? 'ok' : (p.trick === 'confirm' ? 'close' : 'x') };
}
