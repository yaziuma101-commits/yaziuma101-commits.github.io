// 部屋の場面に入ったとき、最初に「ゲームの紹介」を出す包み（DOM の薄い利用者）。
// 場面が自分で遊び方（#mg-howto）を出していれば、そこに説明・勝ち方・持ち込み効果を足してまとめる。
// 出していなければ同じ形の紹介を出し、Enter / Space で閉じるまで場面を止める。Esc で館に戻る。
import { createMinigamePanel } from './scenes/touch.js';
import { gameIntroView, constructionIntroView } from './game-intro.js';

const START_KEYS = ['Enter', 'NumpadEnter', 'Space'];

/** 場面が出した遊び方のパネルに紹介の中身を足す。足したら true（既に足してあれば false） */
export function decorateHowto(root, view, doc) {
  if (!root || !view || !doc) return false;
  const panel = root.querySelector('.mg-panel') || root;
  if (panel.querySelector('.mg-desc')) return false;
  const mk = (cls, text) => {
    const e = doc.createElement('p');
    e.className = cls;
    e.textContent = text;
    return e;
  };
  const dl = panel.querySelector('dl');
  const note = panel.querySelector('.mg-note');
  const descRef = dl || note || null;
  for (const line of view.lines || []) if (line) panel.insertBefore(mk('mg-desc', line), descRef);
  if (view.win) panel.insertBefore(mk('mg-win', view.win), note || null);
  if (view.carry) panel.insertBefore(mk('mg-carry', view.carry), note || null);
  if (note) {
    if (!/Esc/.test(String(note.textContent || ''))) note.textContent = `${note.textContent} ／ Esc で館に戻る`;
  } else if (view.note) {
    panel.insertBefore(mk('mg-note', view.note), null);
  }
  return true;
}

/**
 * scene を包む。opts: { kind:'game'|'construction', gameId, input, doc, returnToGallery(id), carryLineFor(id) }
 */
export function withGameIntro(scene, opts = {}) {
  const kind = opts.kind === 'construction' ? 'construction' : 'game';
  const input = opts.input || null;
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  let panel = null;
  let mode = null; // null | 'own' | 'inner'
  let gameId = opts.gameId || null;
  let leaving = false;

  const pressed = (...codes) => !!input && typeof input.wasPressed === 'function' && !!input.wasPressed(...codes);
  const howtoEl = () => (doc && typeof doc.getElementById === 'function' ? doc.getElementById('mg-howto') : null);
  const visible = (el) => !!el && !el.classList.contains('hidden');

  function back() {
    if (leaving) return;
    leaving = true;
    if (mode === 'own' && panel) panel.hide();
    if (mode === 'inner') {
      const el = howtoEl();
      if (el) el.classList.add('hidden');
    }
    mode = null;
    let ok = false;
    try {
      ok = typeof opts.returnToGallery === 'function' && !!opts.returnToGallery(gameId);
    } catch {
      ok = false;
    }
    if (!ok) leaving = false;
  }

  return {
    enter(params = {}) {
      const p = params && typeof params === 'object' ? params : {};
      gameId = typeof p.gameId === 'string' && p.gameId ? p.gameId : (opts.gameId || null);
      leaving = false;
      mode = null;
      if (typeof scene.enter === 'function') scene.enter(p);
      let carryLine = null;
      try {
        carryLine = typeof opts.carryLineFor === 'function' ? opts.carryLineFor(gameId) : null;
      } catch {
        carryLine = null;
      }
      const view = kind === 'construction'
        ? constructionIntroView(gameId, p.title)
        : gameIntroView(gameId, { carryLine });
      if (!view) return;
      const el = howtoEl();
      if (kind === 'game' && visible(el)) {
        decorateHowto(el, view, doc);
        mode = 'inner';
        return;
      }
      if (!panel) panel = createMinigamePanel(opts.doc ? { doc: opts.doc } : {});
      mode = 'own';
      panel.show(view, () => {
        if (mode === 'own') mode = null;
      });
    },
    update(dt) {
      if (mode === 'inner' && !visible(howtoEl())) mode = null;
      if (mode) {
        if (pressed('Escape')) {
          back();
          return;
        }
        if (mode === 'own') {
          if (pressed(...START_KEYS) && panel) panel.close();
          return;
        }
      }
      if (typeof scene.update === 'function') scene.update(dt);
    },
    exit() {
      if (mode === 'own' && panel) panel.hide();
      mode = null;
      if (typeof scene.exit === 'function') scene.exit();
    },
    // 試し遊び用: 中の場面の状態に、紹介の画面が出ているか（intro）を添える
    smokeState() {
      const g = typeof scene.smokeState === 'function' ? scene.smokeState() : null;
      return g && typeof g === 'object' ? { ...g, intro: mode } : g;
    },
    get pausable() { return mode ? false : scene.pausable !== false; },
    pauseItems() {
      const p = scene.pauseItems;
      try {
        const list = typeof p === 'function' ? p.call(scene) : p;
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    },
    onPauseAction(id) {
      const fn = scene.onPauseAction || scene.onPause || scene.pauseAction;
      if (typeof fn === 'function') fn.call(scene, id);
    },
    get carry() { return scene.carry; },
    get inner() { return scene; },
    introOpen: () => !!mode,
  };
}
