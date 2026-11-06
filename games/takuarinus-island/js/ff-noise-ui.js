// 「ファイルを見つけろ」のお邪魔の小窓（広告・警告）と、始まりに開いている関係ない窓の中身（HTML）。
// 作るときには DOM に触らない（呼ばれたときに渡された document で要素を作る）。
import { junkLines } from './ff-junk.js';
import { pickDrawing, drawingPath } from './drawing-usage.js';
import { PALETTE } from './palette.js';

function mk(d, tag, cls, text) {
  const e = d.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 「画像の表示」：新しい絵を出す。読めなければ fallback（要素）を見せる */
export function buildDrawingPicture(d, file, fallback = null) {
  const box = mk(d, 'div', 'ff-pic');
  box.style.cssText = 'border:2px inset;padding:4px;margin:4px 0;text-align:center;overflow:hidden';
  box.style.background = PALETTE.ffPicBg;
  box.style.borderColor = PALETTE.ffPicBorder;
  const img = mk(d, 'img', 'ff-pic-img');
  img.alt = String(file || '');
  img.style.cssText = 'max-width:100%;max-height:150px;display:inline-block;vertical-align:middle';
  img.onerror = () => {
    img.remove();
    if (fallback && fallback.style) fallback.style.display = '';
  };
  img.src = drawingPath(file);
  box.append(img);
  if (fallback) {
    if (fallback.style) fallback.style.display = 'none';
    box.append(fallback);
  }
  return box;
}

/** 関係ない窓の中身。タブがあれば並べ、押すと onTab(i) */
export function buildJunkBody(d, junk, onTab) {
  const j = junk || {};
  const wrap = mk(d, 'div', `ff-jb ff-jb-${j.kind || 'memo'}`);
  const tabs = Array.isArray(j.tabs) ? j.tabs : [];
  if (tabs.length) {
    const cur = Math.max(0, Math.min(tabs.length - 1, Math.floor(Number(j.tab) || 0)));
    const bar = mk(d, 'div', 'ff-jb-tabs');
    tabs.forEach((tb, i) => {
      const b = mk(d, 'button', i === cur ? 'ff-jb-tab ff-jb-on' : 'ff-jb-tab', tb.title);
      b.type = 'button';
      b.tabIndex = -1;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof onTab === 'function') onTab(i);
      });
      bar.append(b);
    });
    wrap.append(bar, mk(d, 'div', 'ff-jb-addr', `アドレス　mohi://${tabs[cur].title}`));
  }
  if (j.kind === 'image') {
    const tofu = mk(d, 'div', 'ff-jb-tofu');
    const file = pickDrawing('find-file', String(j.key ?? j.title ?? ''));
    wrap.append(file ? buildDrawingPicture(d, file, tofu) : tofu);
  }
  const page = mk(d, 'div', 'ff-jb-page');
  for (const line of junkLines(j)) page.append(mk(d, 'p', '', line));
  wrap.append(page);
  return wrap;
}

/** 小窓を描く入れ物。sync(list) で ff-popups の list() どおりにそろえる。操作は onPress(id, act) */
export function createPopupHost(layer, { onPress = null } = {}) {
  const els = new Map();
  const press = (id, act) => {
    if (typeof onPress !== 'function') return;
    try {
      onPress(id, act);
    } catch (err) {
      console.warn(err);
    }
  };

  function button(d, label, id, act) {
    const b = mk(d, 'button', 'ff-btn', label);
    b.type = 'button';
    b.tabIndex = -1;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      press(id, act);
    });
    return b;
  }

  function build(d, p) {
    const cls = ['ff-pop', `ff-pop-${p.kind}`];
    if (p.blink) cls.push('ff-pop-blink');
    if (p.grow) cls.push('ff-pop-grow');
    if (p.trick === 'tinyX') cls.push('ff-pop-tiny');
    const el = mk(d, 'div', cls.join(' '));
    el.style.left = `${p.x}%`;
    el.style.top = `${p.y}%`;
    const bar = mk(d, 'div', 'ff-pop-bar');
    const x = mk(d, 'button', 'ff-pop-x', '×');
    x.type = 'button';
    x.tabIndex = -1;
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      press(p.id, 'x');
    });
    bar.append(mk(d, 'span', 'ff-pop-title', p.title), x);
    const body = mk(d, 'div', 'ff-pop-body');
    body.append(mk(d, 'div', 'ff-pop-mark', p.kind === 'ad' ? '★' : p.kind === 'warn' ? '!' : '?'), mk(d, 'p', '', p.text));
    body.addEventListener('click', (e) => {
      e.stopPropagation();
      press(p.id, 'body');
    });
    const btns = mk(d, 'div', 'ff-pop-btns');
    if (p.kind === 'confirm') btns.append(button(d, 'はい', p.id, 'yes'), button(d, 'いいえ', p.id, 'no'));
    else if (p.kind === 'warn') btns.append(button(d, 'OK', p.id, 'ok'));
    else if (p.trick === 'confirm') btns.append(button(d, '今すぐクリック！', p.id, 'body'), button(d, '閉じる', p.id, 'close'));
    else btns.append(button(d, '今すぐクリック！', p.id, 'body'));
    el.append(bar, body, btns);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    if (p.trick === 'dodgeX') {
      // × にマウスを近づけると少し逃げる（逃げる回数には上限がある）
      el.addEventListener('pointermove', (e) => {
        if (typeof x.getBoundingClientRect !== 'function') return;
        const r = x.getBoundingClientRect();
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        if (Math.hypot(e.clientX - cx, e.clientY - cy) < Math.max(18, r.width * 1.6)) press(p.id, 'dodge');
      });
    }
    return { el, x };
  }

  function sync(list) {
    if (!layer) return;
    const d = layer.ownerDocument;
    const alive = new Set();
    (Array.isArray(list) ? list : []).forEach((p, z) => {
      if (!p || !p.id) return;
      alive.add(p.id);
      let rec = els.get(p.id);
      if (!rec) {
        rec = build(d, p);
        els.set(p.id, rec);
        layer.append(rec.el);
      }
      rec.el.style.zIndex = String(1 + z);
      rec.el.style.setProperty('--dodge', String(p.dodged || 0));
    });
    for (const [id, rec] of els) {
      if (!alive.has(id)) {
        rec.el.remove();
        els.delete(id);
      }
    }
  }

  return { sync, clear: () => sync([]) };
}
