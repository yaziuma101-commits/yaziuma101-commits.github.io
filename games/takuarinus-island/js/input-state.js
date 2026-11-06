// キー・マウスの入力状態の規則（three.js・DOM に依存しない）
// DOM のイベントは input.js が受け取り、ここへ「種類と中身」だけを渡す。
export const PREVENT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
/** 左クリックの押下エッジのコード */
export const MOUSE_LEFT = 'Mouse0';

export function createInputState() {
  const down = new Set();
  const pressed = new Set();
  let dragDx = 0;
  let dragging = false;
  let lastX = 0;

  /** 押しっぱなしを解除する（キーとドラッグ） */
  const releaseAll = () => {
    down.clear();
    dragging = false;
  };

  return {
    keyDown(code, repeat = false) {
      if (typeof code !== 'string' || !code) return;
      if (!repeat) pressed.add(code);
      down.add(code);
    },
    keyUp(code) {
      down.delete(code);
    },
    releaseAll,
    pointerDown(button, x = 0) {
      if (button === 0) {
        dragging = true;
        lastX = Number.isFinite(x) ? x : 0;
        pressed.add(MOUSE_LEFT);
        return;
      }
      // 右・中ボタン（メニューや自動スクロールで keyup を取りこぼしやすい）
      releaseAll();
    },
    pointerMove(x) {
      if (!dragging || !Number.isFinite(x)) return;
      dragDx += x - lastX;
      lastX = x;
    },
    pointerUp() {
      dragging = false;
    },
    isDown: (...codes) => codes.some((c) => down.has(c)),
    wasPressed: (...codes) => codes.some((c) => pressed.has(c)),
    heldCount: () => down.size,
    consumeDrag() {
      const d = dragDx;
      dragDx = 0;
      return d;
    },
    /** このフレームの押下エッジを消す（他の処理に二重に効かせない） */
    consume(...codes) {
      for (const c of codes) pressed.delete(c);
    },
    endFrame() {
      pressed.clear();
    },
    reset() {
      pressed.clear();
      dragDx = 0;
    },
  };
}

/**
 * イベントの種類と中身で状態を更新する。
 * e: { code, repeat, button, clientX, hidden }
 * 返り値: { preventDefault: bool }（ブラウザ既定の動作を止めるか）
 */
export function handleEvent(state, type, e = {}) {
  const ev = e || {};
  switch (type) {
    case 'keydown':
      state.keyDown(ev.code, !!ev.repeat);
      return { preventDefault: PREVENT_KEYS.has(ev.code) };
    case 'keyup':
      state.keyUp(ev.code);
      break;
    case 'blur':
    case 'pagehide':
      state.releaseAll();
      break;
    case 'contextmenu':
      state.releaseAll();
      return { preventDefault: true };
    case 'visibilitychange':
      if (ev.hidden) state.releaseAll();
      break;
    case 'pointerdown':
      state.pointerDown(ev.button, ev.clientX);
      break;
    case 'pointermove':
      state.pointerMove(ev.clientX);
      break;
    case 'pointerup':
    case 'pointercancel':
      state.pointerUp();
      break;
    default:
      break;
  }
  return { preventDefault: false };
}
