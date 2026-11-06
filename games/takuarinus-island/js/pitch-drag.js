// マウス（指）の縦のドラッグ量を集める（DOM の薄い利用者）。
// 読み込み時には DOM に触らず、最初に使われたときに待ち受けを始める。
// マウスが固定されている間（FPS）は数えない。
let state = null;

function ensure() {
  if (state) return state;
  state = { down: false, id: null, lastY: 0, dy: 0 };
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return state;
  const locked = () => typeof document !== 'undefined' && !!document.pointerLockElement;
  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || locked()) return;
    state.down = true;
    state.id = e.pointerId;
    state.lastY = e.clientY;
  });
  window.addEventListener('pointermove', (e) => {
    if (!state.down || (state.id !== null && e.pointerId !== state.id)) return;
    if (locked()) {
      state.lastY = e.clientY;
      return;
    }
    state.dy += e.clientY - state.lastY;
    state.lastY = e.clientY;
  });
  const up = (e) => {
    if (state.id !== null && e && e.pointerId !== undefined && e.pointerId !== state.id) return;
    state.down = false;
    state.id = null;
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('blur', () => {
    state.down = false;
    state.id = null;
  });
  return state;
}

/** たまった縦のドラッグ量（px、下が正）を取り出して 0 に戻す */
export function consumePitchDrag() {
  const s = ensure();
  const v = s.dy;
  s.dy = 0;
  return v;
}

/** たまった量を捨てる（場面に入ったとき） */
export function resetPitchDrag() {
  ensure().dy = 0;
}
