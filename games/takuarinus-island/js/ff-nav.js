// 「ファイルを見つけろ」の窓・移動・履歴。three.js・DOM に依存しない。

const FOLDERISH = new Set(['root', 'drive', 'folder']);

export function createDesktop() {
  return {
    windows: [], focusId: null, openedLog: [], nextId: 1,
  };
}

function logOpen(desk, folderId) {
  const log = desk.openedLog;
  if (log[log.length - 1] !== folderId) log.push(folderId);
}

export function getWindow(desk, id) {
  return desk && Array.isArray(desk.windows) ? desk.windows.find((w) => w.id === id) || null : null;
}

/** 窓を開く。戻り値は窓の id */
export function openWindow(desk, tree, folderId = tree.rootId, pos = null) {
  const id = desk.nextId++;
  const n = desk.windows.length;
  const w = {
    id,
    folderId,
    history: [folderId],
    index: 0,
    view: 'icon',
    x: pos && Number.isFinite(pos.x) ? pos.x : 16 + (n % 5) * 5,
    y: pos && Number.isFinite(pos.y) ? pos.y : 3 + (n % 5) * 6,
  };
  desk.windows.push(w);
  desk.focusId = id;
  logOpen(desk, folderId);
  return id;
}

export function closeWindow(desk, id) {
  const i = desk.windows.findIndex((w) => w.id === id);
  if (i < 0) return false;
  desk.windows.splice(i, 1);
  const top = desk.windows[desk.windows.length - 1];
  desk.focusId = top ? top.id : null;
  return true;
}

export function focusWindow(desk, id) {
  const i = desk.windows.findIndex((w) => w.id === id);
  if (i < 0) return false;
  const [w] = desk.windows.splice(i, 1);
  desk.windows.push(w);
  desk.focusId = id;
  return true;
}

export function moveWindow(desk, id, x, y) {
  const w = getWindow(desk, id);
  if (!w || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  w.x = x;
  w.y = y;
  return true;
}

export function setView(desk, id, view) {
  const w = getWindow(desk, id);
  if (!w || (view !== 'icon' && view !== 'detail')) return false;
  w.view = view;
  return true;
}

export function navigateTo(desk, tree, id, folderId) {
  const w = getWindow(desk, id);
  const n = tree && tree.nodes ? tree.nodes[folderId] : null;
  if (!w || !n || !FOLDERISH.has(n.kind) || w.folderId === folderId) return false;
  w.history = w.history.slice(0, w.index + 1);
  w.history.push(folderId);
  w.index = w.history.length - 1;
  w.folderId = folderId;
  logOpen(desk, folderId);
  return true;
}

export function openItem(desk, tree, winId, nodeId) {
  const n = tree && tree.nodes ? tree.nodes[nodeId] : null;
  if (!n) return { kind: 'none' };
  if (FOLDERISH.has(n.kind)) {
    navigateTo(desk, tree, winId, nodeId);
    return { kind: 'folder', node: n };
  }
  if (n.kind === 'file') return { kind: 'file', node: n };
  return { kind: 'none' };
}

export function goUp(desk, tree, id) {
  const w = getWindow(desk, id);
  const n = w ? tree.nodes[w.folderId] : null;
  if (!n || !n.parentId) return false;
  return navigateTo(desk, tree, id, n.parentId);
}

function step(desk, id, delta) {
  const w = getWindow(desk, id);
  if (!w) return false;
  const i = w.index + delta;
  if (i < 0 || i >= w.history.length) return false;
  w.index = i;
  w.folderId = w.history[i];
  logOpen(desk, w.folderId);
  return true;
}

export function goBack(desk, id) { return step(desk, id, -1); }
export function goForward(desk, id) { return step(desk, id, 1); }

/** アドレス欄の文字 */
export function addressOf(tree, folderId) {
  const n = tree.nodes[folderId];
  if (!n || n.kind === 'root') return 'マイコンピュータ';
  const names = [];
  let c = n;
  while (c && c.kind !== 'root') {
    names.unshift(c.name);
    c = tree.nodes[c.parentId];
  }
  return names.length === 1 ? `${names[0]}\\` : names.join('\\');
}

export function isDoubleClick(dtMs, { windowMs = 400 } = {}) {
  return Number.isFinite(dtMs) && dtMs > 0 && dtMs <= windowMs;
}

/** 直前に開いたフォルダへ飛ぶ（しおり） */
export function jumpToLastOpened(desk, tree, winId) {
  const log = desk.openedLog;
  if (log.length < 2) return false;
  return navigateTo(desk, tree, winId, log[log.length - 2]);
}

/** 矢印で選択を動かす。並びの端で止まる。何も選んでいなければ端から */
export function moveSelection(items, currentId, delta) {
  return moveSelectionImpl(items, currentId, delta);
}

/** デスクトップの窓の並び（Z 順。末尾が最前面）。無ければ空 */
export function winListOf(desk) {
  return desk && Array.isArray(desk.windows) ? desk.windows : [];
}

function moveSelectionImpl(items, currentId, delta) {
  if (!Array.isArray(items) || !items.length) return null;
  const i = items.findIndex((n) => n && n.id === currentId);
  if (i < 0) return items[delta < 0 ? items.length - 1 : 0].id;
  return items[Math.max(0, Math.min(items.length - 1, i + delta))].id;
}
