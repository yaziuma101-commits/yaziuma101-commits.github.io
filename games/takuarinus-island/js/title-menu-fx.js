// タイトルの選択肢の演出（DOM の薄い利用者）：選んでいる項目に tm-sel を付け（モヒカンのカーソル・強調は CSS）、
// 決定のときに tm-poyon で「ポヨン」と弾ませる。読み込み時には DOM に触らない。
import {
  pickSelectedIndex, isConfirmKey, menuMotion, POYON_MS, KNOWN_SELECTED_CLASSES,
} from './title-menu-rules.js';
import { loadSillyLevel, SILLY_STORAGE_KEY } from './silly-rules.js';
import { PALETTE } from './palette.js';

const MENU_ID = 'title-menu';
const CSS_VARS = Object.freeze([
  'uiAccent', 'uiShade', 'uiText', 'uiPanel', 'uiBorder', 'uiGold', 'uiDim', 'heroMohican', 'heroMohicanStripe',
]);
const MARK_SELECTOR = [
  '[aria-selected="true"]', '[aria-current="true"]', '[aria-current="page"]',
  ...KNOWN_SELECTED_CLASSES.map((c) => `.${c}`),
].join(',');

function describe(el, doc) {
  const attr = (n) => (typeof el.getAttribute === 'function' ? el.getAttribute(n) : null);
  let innerMarked = false;
  try { innerMarked = !!el.querySelector(MARK_SELECTOR); } catch { innerMarked = false; }
  const active = doc.activeElement;
  const cur = attr('aria-current');
  return {
    classes: [...el.classList],
    aria: attr('aria-selected') === 'true' || cur === 'true' || cur === 'page',
    innerMarked,
    focused: !!active && active !== doc.body && el.contains(active),
  };
}

function ensureVars(doc) {
  const win = doc.defaultView;
  if (!win || typeof win.getComputedStyle !== 'function') return;
  const root = doc.documentElement;
  const cs = win.getComputedStyle(root);
  for (const k of CSS_VARS) {
    const name = `--p-${k}`;
    if (!cs.getPropertyValue(name).trim()) root.style.setProperty(name, PALETTE[k]);
  }
}

/** タイトルの選択肢に演出を付ける（何度呼んでも1回だけ） */
export function installTitleMenuFx(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || !doc.documentElement || doc.__titleMenuFx) return null;
  doc.__titleMenuFx = true;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  if (!win) return null;
  ensureVars(doc);
  const timers = new WeakMap();

  const sillyLevel = () => {
    try { return loadSillyLevel(win.localStorage.getItem(SILLY_STORAGE_KEY)); } catch { return 2; }
  };

  function sync() {
    const menu = doc.getElementById(MENU_ID);
    if (!menu) return;
    const calm = menuMotion(sillyLevel()) === 'calm';
    if (menu.classList.contains('tm-calm') !== calm) menu.classList.toggle('tm-calm', calm);
    const items = [...menu.children];
    if (!items.length) return;
    const idx = pickSelectedIndex(items.map((el) => describe(el, doc)));
    items.forEach((el, i) => {
      const want = i === idx;
      if (el.classList.contains('tm-sel') !== want) el.classList.toggle('tm-sel', want);
      if (el.style.getPropertyValue('--tm-i') !== String(i)) el.style.setProperty('--tm-i', String(i));
    });
  }

  function poyon(el) {
    if (!el) return;
    el.classList.remove('tm-poyon');
    void el.offsetWidth; // アニメーションをやり直す
    el.classList.add('tm-poyon');
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => el.classList.remove('tm-poyon'), POYON_MS));
  }

  const visibleMenu = () => {
    const menu = doc.getElementById(MENU_ID);
    return menu && menu.getClientRects().length > 0 ? menu : null;
  };

  if (typeof win.MutationObserver === 'function') {
    const mo = new win.MutationObserver(() => sync());
    mo.observe(doc.body || doc.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-current'],
    });
  }
  setInterval(sync, 500);
  doc.addEventListener('focusin', () => sync());
  doc.addEventListener('keydown', (e) => {
    if (e.repeat || !isConfirmKey(e.code)) return;
    const menu = visibleMenu();
    if (!menu) return;
    sync();
    poyon(menu.querySelector(':scope > .tm-sel'));
  }, true);
  doc.addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    poyon(t.closest(`#${MENU_ID} > *`));
  }, true);
  sync();
  return { sync };
}
