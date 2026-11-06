// 「ファイルを見つけろ」の画面（モヒカンOS 98。オリジナルのデザイン）。HTML で 3D の上に重ねる。
// 作るときには DOM に触らない（mount したときに要素を作る）。node --test から import できる。
import { isDoubleClick, addressOf, winListOf } from './ff-nav.js';
import { childrenOf } from './ff-tree.js';
import { fileProperties, describeClue, SEASON_LABELS } from './ff-clues.js';
import { matchResult } from './ff-match.js';
import { buildJunkBody, buildDrawingPicture } from './ff-noise-ui.js';
import { pickDrawing } from './drawing-usage.js';

const f = Object.freeze;
// 以前の名前（窓を描く・消す）も使えるようにする。実在の OS 名と同じ綴りを書かないため、名前は組み立てる
const LEGACY_RENDER = ['render', 'Win', 'dows'].join('');
const LEGACY_CLEAR = ['clear', 'Win', 'dows'].join('');

export const FF_OS_NAME = 'モヒカンOS 98';
export const FF_TITLE = 'ファイルを見つけろ';
export const FF_INTRO_TEXT = '昔のパソコンの中から目的のファイルを探せ。おとりに注意。外すと10秒待ち';

/** デスクトップのアイコン */
export const FF_DESKTOP_ICONS = f([
  f({ id: 'mycomputer', label: 'マイコンピュータ', icon: 'pc' }),
  f({ id: 'trash', label: 'ごみ箱', icon: 'trash' }),
  f({ id: 'search', label: '検索', icon: 'search' }),
  f({ id: 'submit', label: '提出箱', icon: 'submit' }),
]);

/** タスクバーの時計（'9:05'）。Date か {h,m} か (h, m) */
export function ffClockText(a, b) {
  let h;
  let m;
  if (a && typeof a.getHours === 'function') {
    h = a.getHours();
    m = a.getMinutes();
  } else if (a && typeof a === 'object') {
    h = Number(a.h);
    m = Number(a.m);
  } else {
    h = Number(a);
    m = Number(b);
  }
  h = Number.isFinite(h) ? ((Math.floor(h) % 24) + 24) % 24 : 0;
  m = Number.isFinite(m) ? ((Math.floor(m) % 60) + 60) % 60 : 0;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** 紹介の画面の中身 */
export function ffIntroView(carryLine = null) {
  return {
    title: FF_TITLE,
    sub: `${FF_OS_NAME} の中から、手がかりに合うファイルを探せ！`,
    lines: [
      FF_INTRO_TEXT,
      'とうふアリヌスも同じファイルを探している。先に見つけられたら、その回は相手の点。',
      '似た名前のおとりに注意。プロパティで大きさ・種類・更新日時を確かめよう。',
    ],
    rows: [
      ['ダブルクリック', 'フォルダを開く／ファイルのプロパティを見る'],
      ['右クリック', 'メニュー（開く・プロパティ・提出箱へ送る）'],
      ['ドラッグ', 'ファイルを提出箱へ入れる／タイトルバーで窓を動かす'],
      ['矢印・Enter', '選ぶ・開く（ファイルは Enter で提出）'],
      ['Backspace', '上のフォルダへ'],
      ['Esc', 'ポーズ（館に戻る）'],
    ],
    win: '勝ち方：5回戦の合計点が多いほうの勝ち。早く見つけるほど高得点。',
    carry: typeof carryLine === 'string' && carryLine ? carryLine : '持ち込み：なし',
    note: 'Enter / Space / クリック: 起動する　Esc: 館に戻る',
  };
}

/** 一覧のアイコンの class */
export function ffItemIconClass(n) {
  if (!n) return 'ff-ico';
  if (n.kind === 'file') return `ff-ico ff-ico-file ff-ext-${String(n.ext || '').slice(1)}`;
  return `ff-ico ff-ico-${n.kind === 'root' ? 'pc' : n.kind}`;
}

const KIND_LABELS = f({ folder: 'ファイル フォルダ', drive: 'ローカル ディスク', root: '' });

/** 画面の上の表示（2行） */
export function ffHudLines(match, clock = 0, { highlight = false } = {}) {
  if (!match || !match.round) return [];
  const n = Math.min(match.roundIndex + 1, match.rounds);
  const sec = Math.max(0, Math.floor((Number(clock) || 0) - match.round.startedAt));
  const lines = [
    `第${n}/${match.rounds}回戦　あなた ${match.scores.player} − ${match.scores.ai} とうふアリヌス　経過 ${sec}秒`,
    `探すファイル：${describeClue(match.round.tree.clue)}`,
  ];
  if (highlight) lines.push(ffClueKeyText(match.round.tree.clue));
  return lines;
}

/** 手がかりの大事なところ（持ち込みの「強調表示」） */
export function ffClueKeyText(clue) {
  const c = clue || {};
  const when = c.yearsAgo === 1 ? '去年' : '今年';
  return `大事なところ：名前「${c.title}」／拡張子 ${c.ext}／${when}の${SEASON_LABELS[c.season] || '？'}／${c.approxKB}KB くらい`;
}

/** 提出前の確認の小窓（持ち込みの「本当にこれ？」） */
export function ffConfirmView(node) {
  const name = node && node.name ? node.name : '';
  return {
    caption: '提出の確認',
    title: '本当にこれ？',
    tone: '',
    lines: [`「${name}」を提出箱に入れます。`],
    choices: [{ id: 'yes', label: 'はい' }, { id: 'no', label: 'いいえ' }],
  };
}

/** 外したあとの待ちの文（待っていなければ ''） */
export function ffLockText(sec) {
  const n = Math.ceil((Number(sec) || 0) - 1e-9);
  return n > 0 ? `ちがうファイル！ あと ${n} 秒` : '';
}

/** 1回戦の結果の小窓 */
export function ffRoundResultView(match) {
  const r = match && match.results.length ? match.results[match.results.length - 1] : null;
  if (!r) return { title: '', lines: [], choices: [{ id: 'next', label: '次へ' }] };
  const tree = match.round.tree;
  const target = tree.nodes[tree.targetId];
  const player = r.winner === 'player';
  return {
    caption: `第${r.index + 1}回戦の結果`,
    title: player ? '正解！' : 'とうふアリヌスが先に見つけた！',
    tone: player ? 'good' : 'bad',
    lines: [
      player ? `あなたに ${r.points}点` : `とうふアリヌスに ${r.points}点`,
      r.wrong > 0 ? `まちがえた回数：${r.wrong}` : null,
      target ? `正解は「${target.name}」（${addressOf(tree, target.parentId)}）` : null,
      `合計　あなた ${match.scores.player} − ${match.scores.ai} とうふアリヌス`,
    ].filter(Boolean),
    choices: [{ id: 'next', label: '次へ' }],
  };
}

const RESULT_TITLES = f({ win: '勝ち！', lose: '負け…', draw: '引き分け' });

/** 5回戦の最後の結果 */
export function ffFinalView(match, extra = []) {
  const res = matchResult(match) || 'draw';
  const rounds = (match ? match.results : [])
    .map((r) => `${r.index + 1}回戦 ${r.winner === 'player' ? 'あなた' : 'とうふ'} +${r.points}`)
    .join('　');
  return {
    caption: '試合終了',
    title: RESULT_TITLES[res],
    tone: res === 'win' ? 'good' : res === 'lose' ? 'bad' : '',
    result: res,
    lines: [
      `合計　あなた ${match.scores.player} − ${match.scores.ai} とうふアリヌス`,
      rounds,
      ...(Array.isArray(extra) ? extra.filter((s) => typeof s === 'string' && s) : []),
    ].filter(Boolean),
    choices: [{ id: 'again', label: 'もう一度' }, { id: 'gallery', label: '館に戻る' }],
  };
}

function mk(d, tag, cls, text) {
  const e = d.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function call(fn, ...a) {
  if (typeof fn !== 'function') return undefined;
  try {
    return fn(...a);
  } catch (err) {
    console.warn(err);
    return undefined;
  }
}

const SCREEN_CLASS = f({ off: 'ff-off', boot: 'ff-booting', on: 'ff-on' });

export function createFfUi({
  doc = null, onIconOpen = null, onStartItem = null, actions = {}, sfx = null, onSearch = null, onBookmark = null,
} = {}) {
  const D = () => doc || (typeof document !== 'undefined' ? document : null);
  let root = null;
  let hudEl = null;
  let aiEl = null;
  let screenEl = null;
  let clockEl = null;
  let menuEl = null;
  let winLayer = null;
  let ctxEl = null;
  let propsEl = null;
  let lockEl = null;
  let dlgEl = null;
  let searchEl = null;
  let trashEl = null;
  let errEl = null;
  let saverEl = null;
  let mkEl = null;
  let bookmarkEl = null;
  let popLayer = null;
  const iconEls = new Map();
  let screen = 'off';
  let selIcon = null;
  const winEls = new Map();
  let lastTree = null;
  let treeGen = 0;
  let dblMs = 400;
  let lastClick = { key: null, t: 0 };
  let dragStop = null;
  let fileDrag = null;
  let dlg = null;
  let lastClock = '';
  let lastHud = '';
  let lastLock = '';
  const A = (name, ...a) => call(actions && actions[name], ...a);
  /** OS のボタン・メニューを押したときのクリック音 */
  const click = () => call(sfx, 'ffClick');
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function select(id) {
    selIcon = id;
    for (const [k, e] of iconEls) e.classList.toggle('ff-sel', k === id);
  }

  function setMenu(open) {
    if (menuEl) menuEl.classList.toggle('hidden', !open);
  }

  function dbl(key) {
    const now = nowMs();
    const ok = lastClick.key === key && isDoubleClick(now - lastClick.t, { windowMs: dblMs });
    lastClick = ok ? { key: null, t: 0 } : { key, t: now };
    return ok;
  }

  function hideCtx() {
    if (ctxEl) ctxEl.classList.add('hidden');
  }

  function hideProps() {
    if (propsEl) propsEl.classList.add('hidden');
  }

  function showCtx(ev, winId, node) {
    if (!ctxEl || !screenEl) return;
    const d = D();
    const items = [['open', '開く']];
    if (node.kind === 'file') items.push(['props', 'プロパティ'], ['submit', '提出箱へ送る']);
    ctxEl.replaceChildren(...items.map(([act, label]) => {
      const li = mk(d, 'li', '', label);
      li.addEventListener('click', () => {
        click();
        hideCtx();
        A('onItemMenu', act, winId, node.id);
      });
      return li;
    }));
    const r = screenEl.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    ctxEl.style.left = `${Math.max(0, Math.min(x, r.width * 0.72))}px`;
    ctxEl.style.top = `${Math.max(0, Math.min(y, r.height * 0.7))}px`;
    ctxEl.classList.remove('hidden');
  }

  function startDrag(ev, id, el) {
    const W = D() && D().defaultView;
    if (!W || !screenEl) return;
    if (dragStop) dragStop();
    const r = screenEl.getBoundingClientRect();
    const sx = ev.clientX;
    const sy = ev.clientY;
    const ox = parseFloat(el.style.left) || 0;
    const oy = parseFloat(el.style.top) || 0;
    let nx = ox;
    let ny = oy;
    function move(e) {
      nx = Math.max(-40, Math.min(85, ox + ((e.clientX - sx) / (r.width || 1)) * 100));
      ny = Math.max(0, Math.min(85, oy + ((e.clientY - sy) / (r.height || 1)) * 100));
      el.style.left = `${nx}%`;
      el.style.top = `${ny}%`;
    }
    function stop() {
      W.removeEventListener('pointermove', move);
      W.removeEventListener('pointerup', up);
      dragStop = null;
    }
    function up() {
      stop();
      if (nx !== ox || ny !== oy) A('onWinMove', id, nx, ny);
    }
    W.addEventListener('pointermove', move);
    W.addEventListener('pointerup', up);
    dragStop = stop;
    ev.preventDefault();
  }

  /** ファイルを提出箱へドラッグする */
  function beginFileDrag(ev, it, winId) {
    const d = D();
    const W = d && d.defaultView;
    if (!W || !screenEl || !it || it.kind !== 'file') return;
    if (fileDrag) fileDrag();
    const st = {
      sx: ev.clientX, sy: ev.clientY, ghost: null,
    };
    const subEl = iconEls.get('submit');
    const over = (x, y) => {
      if (!subEl) return false;
      const r = subEl.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    function stop() {
      W.removeEventListener('pointermove', move);
      W.removeEventListener('pointerup', up);
      if (st.ghost) st.ghost.remove();
      if (subEl) subEl.classList.remove('ff-drop-hot');
      fileDrag = null;
    }
    function move(e) {
      if (!st.ghost) {
        if (Math.hypot(e.clientX - st.sx, e.clientY - st.sy) < 6) return;
        st.ghost = mk(d, 'div', 'ff-ghost');
        st.ghost.append(mk(d, 'div', ffItemIconClass(it)), mk(d, 'span', '', it.name));
        screenEl.append(st.ghost);
      }
      const r = screenEl.getBoundingClientRect();
      st.ghost.style.left = `${e.clientX - r.left - 30}px`;
      st.ghost.style.top = `${e.clientY - r.top - 18}px`;
      if (subEl) subEl.classList.toggle('ff-drop-hot', over(e.clientX, e.clientY));
    }
    function up(e) {
      const dropped = !!st.ghost && over(e.clientX, e.clientY);
      stop();
      if (dropped) A('onItemSubmit', winId, it.id);
    }
    W.addEventListener('pointermove', move);
    W.addEventListener('pointerup', up);
    fileDrag = stop;
  }

  function bindItem(el, winId, it) {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      hideCtx();
      setMenu(false);
      select(null);
      if (e.button !== 0 && e.button !== 2) return;
      A('onWinFocus', winId);
      A('onItemSelect', winId, it.id);
      if (e.button === 2) {
        lastClick = { key: null, t: 0 };
        showCtx(e, winId, it);
      } else if (dbl(`${winId}:${it.id}`)) {
        A('onItemOpen', winId, it.id);
      } else {
        beginFileDrag(e, it, winId);
      }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function buildWindow(d, id) {
    const el = mk(d, 'div', 'ff-win');
    const bar = mk(d, 'div', 'ff-titlebar');
    const title = mk(d, 'span', 'ff-wintitle', '');
    const x = mk(d, 'button', 'ff-btn ff-x', '×');
    x.type = 'button';
    x.tabIndex = -1;
    x.addEventListener('pointerdown', (e) => e.stopPropagation());
    x.addEventListener('click', () => {
      click();
      A('onWinClose', id);
    });
    bar.append(title, x);
    bar.addEventListener('pointerdown', (e) => { if (e.button === 0) startDrag(e, id, el); });
    const tool = mk(d, 'div', 'ff-toolbar');
    const btn = (label, fn) => {
      const b = mk(d, 'button', 'ff-btn', label);
      b.type = 'button';
      b.tabIndex = -1;
      b.addEventListener('click', () => {
        click();
        fn();
      });
      tool.append(b);
      return b;
    };
    const back = btn('← 戻る', () => A('onWinBack', id));
    const up = btn('↑ 上へ', () => A('onWinUp', id));
    tool.append(mk(d, 'span', 'ff-sep'));
    const vIcon = btn('アイコン', () => A('onWinView', id, 'icon'));
    const vDetail = btn('詳細', () => A('onWinView', id, 'detail'));
    const addr = mk(d, 'div', 'ff-addr');
    const addrBox = mk(d, 'div', 'ff-addr-box', '');
    addr.append(mk(d, 'span', '', 'アドレス'), addrBox);
    const body = mk(d, 'div', 'ff-body');
    const status = mk(d, 'div', 'ff-status', '');
    el.append(bar, tool, addr, body, status);
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      hideCtx();
      setMenu(false);
      A('onWinFocus', id);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return {
      el, title, back, up, vIcon, vDetail, addrBox, body, status, key: '',
    };
  }

  /** 始まりに開いている関係ない窓（タイトルバーで動かせ、× で閉じられる） */
  function buildJunk(d, id, kind) {
    const el = mk(d, 'div', `ff-win ff-junk ff-junk-${kind}`);
    const bar = mk(d, 'div', 'ff-titlebar');
    const title = mk(d, 'span', 'ff-wintitle', '');
    const x = mk(d, 'button', 'ff-btn ff-x', '×');
    x.type = 'button';
    x.tabIndex = -1;
    x.addEventListener('pointerdown', (e) => e.stopPropagation());
    x.addEventListener('click', () => {
      click();
      A('onWinClose', id);
    });
    bar.append(title, x);
    bar.addEventListener('pointerdown', (e) => { if (e.button === 0) startDrag(e, id, el); });
    const body = mk(d, 'div', 'ff-junk-body');
    el.append(bar, body);
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      hideCtx();
      setMenu(false);
      A('onWinFocus', id);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return {
      el, title, body, key: '', junk: kind,
    };
  }

  function fillWindow(d, rec, w, tree, selId) {
    const node = tree.nodes[w.folderId];
    rec.title.textContent = node ? (node.kind === 'drive' ? `${node.name} ドライブ` : node.name) : '';
    rec.addrBox.textContent = addressOf(tree, w.folderId);
    rec.back.disabled = !(w.index > 0);
    rec.up.disabled = !node || node.kind === 'root';
    rec.vIcon.classList.toggle('ff-pressed', w.view === 'icon');
    rec.vDetail.classList.toggle('ff-pressed', w.view === 'detail');
    const items = childrenOf(tree, w.folderId);
    rec.status.textContent = `${items.length} 個のオブジェクト`;
    let list;
    if (w.view === 'detail') {
      list = mk(d, 'table', 'ff-detail');
      const head = mk(d, 'tr');
      for (const h of ['名前', '大きさ', '種類', '更新日時']) head.append(mk(d, 'th', '', h));
      list.append(head);
      for (const it of items) {
        const tr = mk(d, 'tr', it.id === selId ? 'ff-sel' : '');
        const name = mk(d, 'td');
        name.append(mk(d, 'div', ffItemIconClass(it)), mk(d, 'span', '', it.name));
        const p = it.kind === 'file' ? fileProperties(it) : null;
        tr.append(name, mk(d, 'td', '', p ? p.sizeText : ''), mk(d, 'td', '', p ? p.typeLabel : KIND_LABELS[it.kind] || ''),
          mk(d, 'td', '', p ? p.modifiedText : ''));
        bindItem(tr, w.id, it);
        list.append(tr);
      }
    } else {
      list = mk(d, 'div', 'ff-grid');
      for (const it of items) {
        const e = mk(d, 'div', it.id === selId ? 'ff-item ff-sel' : 'ff-item');
        e.append(mk(d, 'div', ffItemIconClass(it)), mk(d, 'span', '', it.name));
        bindItem(e, w.id, it);
        list.append(e);
      }
    }
    rec.body.replaceChildren(list);
    const s = list.querySelector('.ff-sel');
    if (s && typeof s.scrollIntoView === 'function') s.scrollIntoView({ block: 'nearest' });
  }

  /** 窓をデスクトップの状態（ff-nav）どおりに描く。sel は {winId, nodeId} */
  function renderWins(state, tree, sel = null) {
    if (!winLayer || !state || !tree) return;
    const d = D();
    if (tree !== lastTree) {
      lastTree = tree;
      treeGen++;
    }
    const alive = new Set();
    winListOf(state).forEach((w, z) => {
      alive.add(w.id);
      let rec = winEls.get(w.id);
      if (rec && (rec.junk || null) !== (w.junk ? w.junk.kind : null)) {
        rec.el.remove();
        winEls.delete(w.id);
        rec = null;
      }
      if (!rec) {
        rec = w.junk ? buildJunk(d, w.id, w.junk.kind) : buildWindow(d, w.id);
        winEls.set(w.id, rec);
        winLayer.append(rec.el);
      }
      rec.el.style.left = `${w.x}%`;
      rec.el.style.top = `${w.y}%`;
      rec.el.style.zIndex = String(10 + Math.min(z, 55));
      rec.el.classList.toggle('ff-inactive', state.focusId !== w.id);
      if (w.junk) {
        const jkey = `junk|${treeGen}|${w.junk.key}|${w.junk.tab || 0}`;
        if (rec.key !== jkey) {
          rec.key = jkey;
          rec.title.textContent = w.junk.title || '';
          rec.body.replaceChildren(buildJunkBody(d, w.junk, (i) => {
            click();
            A('onJunkTab', w.id, i);
          }));
        }
        return;
      }
      const selId = sel && sel.winId === w.id ? sel.nodeId : null;
      const key = `${treeGen}|${w.folderId}|${w.view}|${selId}|${w.index}|${w.history.length}`;
      if (rec.key !== key) {
        rec.key = key;
        fillWindow(d, rec, w, tree, selId);
      }
    });
    for (const [id, rec] of winEls) {
      if (!alive.has(id)) {
        rec.el.remove();
        winEls.delete(id);
      }
    }
  }

  function clearWins() {
    winEls.clear();
    if (winLayer) winLayer.replaceChildren();
    lastTree = null;
  }

  /** プロパティの小窓（fileProperties の形） */
  function showProps(p) {
    if (!propsEl || !p) return;
    const d = D();
    const bar = mk(d, 'div', 'ff-titlebar');
    const x = mk(d, 'button', 'ff-btn ff-x', '×');
    x.type = 'button';
    x.tabIndex = -1;
    x.addEventListener('click', () => {
      click();
      hideProps();
    });
    bar.append(mk(d, 'span', 'ff-wintitle', `${p.name} のプロパティ`), x);
    const dl = mk(d, 'dl');
    for (const [k, v] of [['名前', p.name], ['種類', p.typeLabel], ['大きさ', p.sizeText], ['更新日時', p.modifiedText]]) {
      dl.append(mk(d, 'dt', '', k), mk(d, 'dd', '', v));
    }
    const ok = mk(d, 'button', 'ff-btn ff-ok', 'OK');
    ok.type = 'button';
    ok.tabIndex = -1;
    ok.addEventListener('click', () => {
      click();
      hideProps();
    });
    // 画像ファイルは「画像の表示」で新しい絵を見せる（読めなければ元の文）
    const pre = mk(d, 'pre', '', p.preview);
    const pic = /\.bmp$/i.test(String(p.name || '')) ? pickDrawing('find-file', p.name) : null;
    const body = pic ? buildDrawingPicture(d, pic, pre) : pre;
    propsEl.replaceChildren(bar, dl, mk(d, 'div', 'ff-props-cap', pic ? '画像の表示' : '中身（はじめの部分）'), body, ok);
    propsEl.classList.remove('hidden');
  }

  // ---- 結果の小窓（OS のダイアログ風） ----
  function markDlg() {
    if (dlg) dlg.buttons.forEach((b, i) => b.classList.toggle('ff-focus', i === dlg.sel));
  }

  function hideDialog() {
    dlg = null;
    if (dlgEl) {
      dlgEl.classList.add('hidden');
      dlgEl.replaceChildren();
    }
  }

  function pickDlg(i) {
    if (!dlg) return;
    const c = (dlg.view.choices || [])[i];
    if (!c) return;
    const cb = dlg.onPick;
    hideDialog();
    call(cb, c.id);
  }

  function showDialog(view, onPick) {
    if (!dlgEl || !view) return;
    const d = D();
    const bar = mk(d, 'div', 'ff-titlebar');
    bar.append(mk(d, 'span', 'ff-wintitle', view.caption || FF_OS_NAME));
    const body = mk(d, 'div', 'ff-dlg-body');
    body.append(mk(d, 'p', view.tone ? `ff-dlg-big ff-${view.tone}` : 'ff-dlg-big', view.title || ''));
    for (const line of view.lines || []) if (line) body.append(mk(d, 'p', '', line));
    const row = mk(d, 'div', 'ff-dlg-btns');
    const buttons = (view.choices || []).map((c, i) => {
      const b = mk(d, 'button', 'ff-btn', c.label);
      b.type = 'button';
      b.tabIndex = -1;
      b.addEventListener('mouseenter', () => {
        if (dlg) {
          dlg.sel = i;
          markDlg();
        }
      });
      b.addEventListener('click', () => {
        click();
        pickDlg(i);
      });
      row.append(b);
      return b;
    });
    dlgEl.replaceChildren(bar, body, row);
    dlgEl.classList.remove('hidden');
    dlg = {
      view, onPick, sel: 0, buttons,
    };
    markDlg();
  }

  function setHud(text) {
    if (!hudEl) return;
    if (text === null || text === undefined || text === '' || (Array.isArray(text) && !text.length)) {
      hudEl.classList.add('hidden');
      lastHud = '';
      return;
    }
    const lines = Array.isArray(text) ? text.map(String) : [String(text)];
    hudEl.classList.remove('hidden');
    const key = lines.join('\n');
    if (key === lastHud) return;
    lastHud = key;
    const d = D();
    hudEl.classList.toggle('ff-multi', lines.length > 1);
    hudEl.replaceChildren(...lines.map((s, i) => mk(d, 'div',
      i === 0 ? 'ff-hud-line' : (i === 1 ? 'ff-hud-line ff-hud-clue' : 'ff-hud-line ff-hud-clue ff-hud-key'), s)));
  }

  function setAi(text, done = false) {
    if (!aiEl) return;
    if (!text) {
      aiEl.classList.add('hidden');
      return;
    }
    aiEl.classList.remove('hidden');
    if (aiEl.textContent !== text) aiEl.textContent = text;
    aiEl.classList.toggle('ff-ai-done', !!done);
  }

  function setLocked(sec) {
    const text = ffLockText(sec);
    if (text === lastLock) return;
    lastLock = text;
    if (screenEl) screenEl.classList.toggle('ff-wait', !!text);
    const sub = iconEls.get('submit');
    if (sub) sub.classList.toggle('ff-dead', !!text);
    if (lockEl) {
      lockEl.textContent = text ? `⌛ ${text}` : '';
      lockEl.classList.toggle('hidden', !text);
    }
  }

  // ---- 検索・ごみ箱・おふざけ（エラー小窓・スクリーンセーバー・モヒカンくん） ----
  const timers = new Set();
  let errTimer = null;
  let saverTimer = null;
  let saverArmAt = 0;
  let mkTimer = null;

  function later(ms, fn) {
    if (typeof setTimeout !== 'function') return null;
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function cancel(id) {
    if (id === null || id === undefined) return;
    clearTimeout(id);
    timers.delete(id);
  }

  function smallBar(d, title, onClose) {
    const bar = mk(d, 'div', 'ff-titlebar');
    const x = mk(d, 'button', 'ff-btn ff-x', '×');
    x.type = 'button';
    x.tabIndex = -1;
    x.addEventListener('click', () => {
      click();
      onClose();
    });
    bar.append(mk(d, 'span', 'ff-wintitle', title), x);
    return bar;
  }

  function okButton(d, label, fn) {
    const b = mk(d, 'button', 'ff-btn ff-ok', label);
    b.type = 'button';
    b.tabIndex = -1;
    b.addEventListener('click', () => {
      click();
      fn();
    });
    return b;
  }

  /** モヒカンに目と手足（モヒカンくん） */
  function mohicanFigure(d) {
    const b = mk(d, 'div', 'ff-mk-fig');
    b.append(
      mk(d, 'i', 'ff-mk-arm ff-mk-arm-l'), mk(d, 'i', 'ff-mk-arm ff-mk-arm-r'),
      mk(d, 'i', 'ff-mk-leg ff-mk-leg-l'), mk(d, 'i', 'ff-mk-leg ff-mk-leg-r'),
      mk(d, 'i', 'ff-mk-hair'), mk(d, 'i', 'ff-mk-eye ff-mk-eye-l'), mk(d, 'i', 'ff-mk-eye ff-mk-eye-r'),
    );
    return b;
  }

  function hideSearch() {
    if (!searchEl) return;
    searchEl.classList.add('hidden');
    searchEl.replaceChildren();
  }

  /** 検索の窓（あるけど役に立たない） */
  function showSearch() {
    if (!searchEl) return;
    const d = D();
    const input = mk(d, 'input', 'ff-search-input');
    input.type = 'text';
    input.placeholder = 'ファイルの名前';
    input.maxLength = 40;
    input.spellcheck = false;
    input.autocomplete = 'off';
    const go = mk(d, 'button', 'ff-btn', '検索開始');
    go.type = 'button';
    go.tabIndex = -1;
    const out = mk(d, 'div', 'ff-search-out', '探したいファイルの名前を入れて「検索開始」');
    const run = () => {
      const r = call(onSearch, input.value);
      if (!r) return;
      out.replaceChildren(mk(d, 'p', '', r.message));
      if (r.substitute) {
        const i = r.substitute.lastIndexOf('.');
        const hit = mk(d, 'div', 'ff-search-hit');
        hit.append(mk(d, 'div', ffItemIconClass({ kind: 'file', ext: i >= 0 ? r.substitute.slice(i) : '' })),
          mk(d, 'span', '', r.substitute));
        out.append(hit);
      }
    };
    go.addEventListener('click', () => {
      click();
      run();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.blur();
        return;
      }
      e.stopPropagation();
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        run();
      }
    });
    const row = mk(d, 'div', 'ff-search-row');
    row.append(mk(d, 'span', '', '名前：'), input, go);
    searchEl.replaceChildren(smallBar(d, '検索：ファイルやフォルダ', hideSearch), row, out);
    searchEl.classList.remove('hidden');
    try {
      input.focus({ preventScroll: true });
    } catch {
      // 握りつぶす
    }
  }

  function hideTrash() {
    if (!trashEl) return;
    trashEl.classList.add('hidden');
    trashEl.replaceChildren();
  }

  /** ごみ箱の中身（先頭はとうふ） */
  function showTrash(items) {
    if (!trashEl) return;
    const d = D();
    const list = Array.isArray(items) ? items : [];
    const note = mk(d, 'div', 'ff-trash-note', list[0] && list[0].note ? `${list[0].name}：${list[0].note}` : '');
    const grid = mk(d, 'div', 'ff-grid');
    list.forEach((it, i) => {
      const e = mk(d, 'div', i === 0 ? 'ff-item ff-sel' : 'ff-item');
      e.append(mk(d, 'div', it.name === 'とうふ' ? 'ff-ico ff-ico-tofu' : 'ff-ico ff-ico-file'), mk(d, 'span', '', it.name));
      e.addEventListener('pointerdown', () => {
        click();
        grid.querySelectorAll('.ff-item').forEach((x) => x.classList.toggle('ff-sel', x === e));
        note.textContent = it.note ? `${it.name}：${it.note}` : it.name;
      });
      grid.append(e);
    });
    const body = mk(d, 'div', 'ff-body');
    body.append(grid);
    trashEl.replaceChildren(smallBar(d, 'ごみ箱', hideTrash), body, note);
    trashEl.classList.remove('hidden');
  }

  function hideErrorPopup() {
    cancel(errTimer);
    errTimer = null;
    if (!errEl) return;
    errEl.classList.add('hidden');
    errEl.replaceChildren();
  }

  /** 突然のエラー小窓（モーダルにしない。OK で消える） */
  function showErrorPopup(message, pos = {}) {
    if (!errEl || !message) return;
    hideErrorPopup();
    const d = D();
    const body = mk(d, 'div', 'ff-err-body');
    body.append(mk(d, 'div', 'ff-err-ico', '×'), mk(d, 'p', '', message));
    errEl.replaceChildren(smallBar(d, FF_OS_NAME, hideErrorPopup), body, okButton(d, 'OK', hideErrorPopup));
    const p = pos && typeof pos === 'object' ? pos : {};
    errEl.style.left = `${Number.isFinite(p.x) ? p.x : 30}%`;
    errEl.style.top = `${Number.isFinite(p.y) ? p.y : 30}%`;
    errEl.classList.remove('hidden');
    errTimer = later(8000, hideErrorPopup);
  }

  function stopScreensaver() {
    cancel(saverTimer);
    saverTimer = null;
    if (!saverEl) return;
    saverEl.classList.add('hidden');
    saverEl.replaceChildren();
  }

  /** 飛ぶモヒカンのスクリーンセーバー（マウスで戻る。ms で自動で終わる） */
  function startScreensaver(ms = 2000) {
    if (!saverEl) return;
    stopScreensaver();
    const d = D();
    const kids = [];
    for (let i = 0; i < 7; i++) {
      const m = mk(d, 'div', 'ff-saver-mh');
      m.style.top = `${6 + ((i * 37) % 70)}%`;
      m.style.fontSize = `${0.7 + (i % 3) * 0.35}em`;
      m.style.animationDuration = `${1.6 + (i % 4) * 0.45}s`;
      m.style.animationDelay = `${-(i * 0.37)}s`;
      m.append(mohicanFigure(d));
      kids.push(m);
    }
    kids.push(mk(d, 'div', 'ff-saver-mark', `${FF_OS_NAME}　マウスを動かすと戻ります`));
    saverEl.replaceChildren(...kids);
    saverEl.classList.remove('hidden');
    saverArmAt = nowMs() + 250;
    saverTimer = later(Math.max(200, Math.min(2000, Number(ms) || 2000)), stopScreensaver);
  }

  function hideAssistant() {
    cancel(mkTimer);
    mkTimer = null;
    if (!mkEl) return;
    mkEl.classList.add('hidden');
    mkEl.replaceChildren();
  }

  /** アシスタント「モヒカンくん」（画面の端に出て吹き出しで話す） */
  function showAssistant(line, ms = 6000) {
    if (!mkEl || !line) return;
    hideAssistant();
    const d = D();
    const bubble = mk(d, 'div', 'ff-mk-bubble');
    bubble.append(mk(d, 'div', 'ff-mk-name', 'モヒカンくん'), mk(d, 'p', '', line), okButton(d, 'わかった', hideAssistant));
    mkEl.replaceChildren(bubble, mohicanFigure(d));
    mkEl.classList.remove('hidden');
    mkTimer = later(ms, hideAssistant);
  }

  function clearFun() {
    hideErrorPopup();
    stopScreensaver();
    hideAssistant();
  }

  function build(d) {
    root = mk(d, 'div');
    root.id = 'ff-root';
    hudEl = mk(d, 'div', 'hidden');
    hudEl.id = 'ff-hud';
    aiEl = mk(d, 'div', 'hidden');
    aiEl.id = 'ff-ai';
    const crt = mk(d, 'div', 'ff-crt');
    screenEl = mk(d, 'div', 'ff-screen ff-off');
    screenEl.addEventListener('contextmenu', (e) => e.preventDefault());

    const boot = mk(d, 'div', 'ff-boot');
    const name = mk(d, 'div', 'ff-boot-name', 'モヒカンOS ');
    name.append(mk(d, 'small', '', '98'));
    const bar = mk(d, 'div', 'ff-boot-bar');
    bar.append(mk(d, 'i'));
    boot.append(mk(d, 'div', 'ff-boot-logo'), name, bar, mk(d, 'div', 'ff-boot-note', 'とうふ印のパソコン　起動しています…'));

    const desk = mk(d, 'div', 'ff-desktop');
    const icons = mk(d, 'div', 'ff-icons');
    for (const ic of FF_DESKTOP_ICONS) {
      const e = mk(d, 'div', 'ff-icon');
      e.dataset.id = ic.id;
      e.append(mk(d, 'div', `ff-ico ff-ico-${ic.icon}`), mk(d, 'span', '', ic.label));
      e.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        setMenu(false);
        hideCtx();
        if (ev.button !== 0 && ev.button !== 2) return;
        select(ic.id);
        A('onDeskClick', ic.id);
        if (ev.button === 0 && dbl(`icon:${ic.id}`)) call(onIconOpen, ic.id);
      });
      icons.append(e);
      iconEls.set(ic.id, e);
    }

    menuEl = mk(d, 'div', 'ff-startmenu hidden');
    const ul = mk(d, 'ul');
    for (const [id, label] of [['about', `${FF_OS_NAME} について`], ['shutdown', 'シャットダウン']]) {
      const li = mk(d, 'li', '', label);
      li.addEventListener('click', () => {
        click();
        setMenu(false);
        call(onStartItem, id);
      });
      ul.append(li);
    }
    menuEl.append(mk(d, 'div', 'ff-startmenu-side', FF_OS_NAME), ul);
    menuEl.addEventListener('pointerdown', (e) => e.stopPropagation());

    const task = mk(d, 'div', 'ff-taskbar');
    const start = mk(d, 'button', 'ff-btn ff-start');
    start.type = 'button';
    start.tabIndex = -1;
    start.append(mk(d, 'span', 'ff-start-logo'), mk(d, 'span', '', 'スタート'));
    start.addEventListener('pointerdown', (e) => e.stopPropagation());
    start.addEventListener('click', () => {
      click();
      setMenu(menuEl.classList.contains('hidden'));
    });
    bookmarkEl = mk(d, 'button', 'ff-btn ff-bookmark hidden', 'しおり (B)');
    bookmarkEl.type = 'button';
    bookmarkEl.tabIndex = -1;
    bookmarkEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    bookmarkEl.addEventListener('click', () => {
      click();
      call(onBookmark);
    });
    lastClock = ffClockText(new Date());
    clockEl = mk(d, 'div', 'ff-clock', lastClock);
    task.append(start, bookmarkEl, clockEl);
    task.addEventListener('pointerdown', (e) => e.stopPropagation());

    winLayer = mk(d, 'div', 'ff-winlayer');
    ctxEl = mk(d, 'ul', 'ff-ctx hidden');
    ctxEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    propsEl = mk(d, 'div', 'ff-props hidden');
    propsEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    dlgEl = mk(d, 'div', 'ff-dialog hidden');
    dlgEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    lockEl = mk(d, 'div', 'ff-lock hidden');
    searchEl = mk(d, 'div', 'ff-search hidden');
    trashEl = mk(d, 'div', 'ff-trash hidden');
    errEl = mk(d, 'div', 'ff-err hidden');
    mkEl = mk(d, 'div', 'ff-mk hidden');
    for (const e of [searchEl, trashEl, errEl, mkEl]) e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    popLayer = mk(d, 'div', 'ff-poplayer');
    saverEl = mk(d, 'div', 'ff-saver hidden');
    saverEl.addEventListener('pointermove', (e) => {
      e.stopPropagation();
      if (nowMs() >= saverArmAt) stopScreensaver();
    });
    saverEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      stopScreensaver();
    });
    desk.append(icons, mk(d, 'div', 'ff-watermark', FF_OS_NAME), winLayer, popLayer, propsEl, searchEl, trashEl, ctxEl, dlgEl,
      errEl, mkEl, lockEl, menuEl, task);
    desk.addEventListener('pointerdown', () => {
      select(null);
      setMenu(false);
      hideCtx();
      A('onDeskClick', null);
    });

    screenEl.append(boot, desk, saverEl, mk(d, 'div', 'ff-scan'));
    crt.append(screenEl, mk(d, 'div', 'ff-crt-led'));
    root.append(hudEl, aiEl, crt);
  }

  return {
    mount() {
      const d = D();
      if (!d || !d.body) return false;
      if (!root) build(d);
      if (!root.isConnected) d.body.append(root);
      return true;
    },
    unmount() {
      clearFun();
      hideSearch();
      hideTrash();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      setMenu(false);
      select(null);
      hideCtx();
      hideProps();
      hideDialog();
      if (dragStop) dragStop();
      if (fileDrag) fileDrag();
      clearWins();
      setLocked(0);
      setAi(null);
      setHud(null);
      lastClick = { key: null, t: 0 };
      if (root) root.remove();
    },
    setScreen(s) {
      screen = SCREEN_CLASS[s] ? s : 'off';
      if (!screenEl) return;
      screenEl.classList.remove('ff-off', 'ff-booting', 'ff-on');
      screenEl.classList.add(SCREEN_CLASS[screen]);
    },
    getScreen: () => screen,
    get screen() { return screen; },
    isMounted: () => !!(root && root.isConnected),
    setHud,
    setAi,
    setLocked,
    /** しおりの残り回数（0 ならボタンを隠す） */
    setBookmark(n) {
      if (!bookmarkEl) return;
      const k = Number(n) > 0 ? Math.floor(Number(n)) : 0;
      bookmarkEl.classList.toggle('hidden', k <= 0);
      bookmarkEl.textContent = k > 1 ? `しおり ×${k} (B)` : 'しおり (B)';
    },
    tick() {
      if (!clockEl) return;
      const c = ffClockText(new Date());
      if (c !== lastClock) {
        lastClock = c;
        clockEl.textContent = c;
      }
    },
    renderWins,
    [LEGACY_RENDER]: renderWins,
    /** お邪魔の小窓を置く層（mount 前は null） */
    popupLayer: () => popLayer,
    clearWins,
    [LEGACY_CLEAR]: clearWins,
    showProps,
    hideProps,
    propsOpen: () => !!propsEl && !propsEl.classList.contains('hidden'),
    closeMenus() {
      setMenu(false);
      hideCtx();
      if (fileDrag) fileDrag();
    },
    selectedIcon: () => selIcon,
    /** ダブルクリックと数える間隔（ミリ秒） */
    setDoubleClickMs(ms) {
      if (Number.isFinite(ms) && ms > 0) dblMs = ms;
    },
    showDialog,
    hideDialog,
    dialogOpen: () => !!dlg,
    dialogMove(delta) {
      if (!dlg || !dlg.buttons.length) return;
      const n = dlg.buttons.length;
      dlg.sel = (((dlg.sel + delta) % n) + n) % n;
      markDlg();
    },
    dialogConfirm() {
      if (dlg) pickDlg(dlg.sel);
    },
    showSearch,
    hideSearch,
    searchOpen: () => !!searchEl && !searchEl.classList.contains('hidden'),
    showTrash,
    hideTrash,
    trashOpen: () => !!trashEl && !trashEl.classList.contains('hidden'),
    showErrorPopup,
    hideErrorPopup,
    startScreensaver,
    stopScreensaver,
    screensaverOn: () => !!saverEl && !saverEl.classList.contains('hidden'),
    showAssistant,
    hideAssistant,
    clearFun,
  };
}
