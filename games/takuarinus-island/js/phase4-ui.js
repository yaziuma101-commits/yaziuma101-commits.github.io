// けん玉・小説の場面で共通の HTML 重ね（紹介・ポーズ・結果）と ctx の呼び出し。
import { loadSillyLevel, SILLY_STORAGE_KEY } from './silly-rules.js';
import { mergeParams, effectSummary } from './item-table.js';

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function addStyle(id, css) {
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

addStyleSafe();
function addStyleSafe() {
  if (typeof document === 'undefined') return;
  addStyle('p4-style', `
.p4-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:28;min-width:320px;max-width:92vw;max-height:88vh;overflow:auto;padding:18px 28px;background:var(--p-uiPanel);color:var(--p-uiText);border:4px solid var(--p-uiShade);border-radius:18px;text-align:center}
.p4-panel h2{margin:0 0 8px;color:var(--p-uiTitle)}
.p4-panel p{margin:4px 0;font-size:15px;text-align:left}
.p4-panel ul{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
.p4-panel li{margin:0;padding:6px 20px;border:3px solid var(--p-uiShade);border-radius:12px;font-size:18px;font-weight:bold;cursor:pointer}
.p4-panel li.sel{border-color:var(--p-uiAccent);color:var(--p-uiAccent)}
.p4-panel .p4-hint{margin:10px 0 0;font-size:13px;text-align:center;opacity:0.8}
.p4-panel .p4-item{background:var(--p-mohicanYellow);border-radius:10px;padding:4px 10px;font-weight:bold}
.p4-msg{position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:27;font-size:40px;font-weight:900;color:var(--p-mohicanYellow);text-shadow:3px 3px 0 var(--p-uiShade);pointer-events:none;white-space:nowrap}
`);
}

/** パネル（選択肢つき）。key(e) が選んだ id を返す */
export const MENU_PREV_KEYS = Object.freeze(['ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW']);
export const MENU_NEXT_KEYS = Object.freeze(['ArrowRight', 'KeyD', 'ArrowDown', 'KeyS']);

export function createMenu(parent,{ title, lines = [], choices = [], extraClass = '' }, onPick) {
  const box = el('div', `p4-panel ${extraClass}`);
  box.appendChild(el('h2', '', title));
  for (const l of lines) {
    if (l && typeof l === 'object') box.appendChild(el('p', l.cls || '', l.text));
    else if (l) box.appendChild(el('p', '', l));
  }
  const ul = el('ul');
  let sel = 0;
  const lis = choices.map((c, i) => {
    const li = el('li', '', c.label);
    li.addEventListener('click', () => onPick(c.id));
    li.addEventListener('mouseenter', () => { sel = i; paint(); });
    ul.appendChild(li);
    return li;
  });
  function paint() { lis.forEach((li, i) => li.classList.toggle('sel', i === sel)); }
  paint();
  if (choices.length) {
    box.appendChild(ul);
    // 他のゲームの結果画面と同じく、横並び・←→ で選ぶ（↑↓ も効く）
    box.appendChild(el('p', 'p4-hint', '←→ で選ぶ ／ Enter で決定'));
  }
  parent.appendChild(box);
  return {
    el: box,
    key(code) {
      if (!choices.length) return;
      if (MENU_PREV_KEYS.includes(code)) { sel = (sel + choices.length - 1) % choices.length; paint(); }
      if (MENU_NEXT_KEYS.includes(code)) { sel = (sel + 1) % choices.length; paint(); }
      if (code === 'Enter' || code === 'Space') onPick(choices[sel].id);
    },
    remove() { box.remove(); },
  };
}

export function sillyLevel() {
  try { return loadSillyLevel(globalThis.localStorage.getItem(SILLY_STORAGE_KEY)); } catch { return 2; }
}

/** 持ち込みの効果 → {params, line} */
export function carryInfo(ctx, gameId, given) {
  let r = given;
  if (!r) {
    try { r = ctx && typeof ctx.carryEffectFor === 'function' ? ctx.carryEffectFor(gameId) : null; } catch { r = null; }
  }
  if (!r || typeof r !== 'object') return { params: {}, line: '' };
  if (Array.isArray(r.effects)) return { params: mergeParams(r.effects), line: effectSummary(r) || '' };
  if (r.params && typeof r.params === 'object') return { params: r.params, line: typeof r.banner === 'string' ? r.banner : '' };
  return { params: r, line: '' };
}

export function toGallery(ctx, gameId) {
  try {
    if (ctx && typeof ctx.returnToGallery === 'function') { ctx.returnToGallery(gameId); return; }
  } catch { /* 下へ */ }
  try { if (ctx && typeof ctx.goto === 'function') ctx.goto('gallery', { gameId, from: gameId }); } catch { /* 握りつぶす */ }
}

export function grantItem(ctx, gameId) {
  try { return ctx && typeof ctx.grantGameItem === 'function' ? ctx.grantGameItem(gameId) : null; } catch { return null; }
}

export function grantedLine(r, name) {
  if (r === true || (r && typeof r === 'object' && r.isNew)) return `アイテム「${name}」を手に入れた！`;
  return '';
}
