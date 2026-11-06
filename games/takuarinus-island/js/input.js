// キー状態・押下エッジ・マウスドラッグ（状態の規則は input-state.js）
import { createInputState, handleEvent } from './input-state.js';

function uniqueTargets(list) {
  const out = [];
  for (const t of list) {
    if (t && typeof t.addEventListener === 'function' && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * target: キー・ポインタを受ける要素（通常は window）
 * env: テスト用の差し替え { win, doc, canvas }
 */
export function createInput(target, env = {}) {
  const win = env.win || (typeof window !== 'undefined' ? window : null);
  const doc = env.doc || (typeof document !== 'undefined' ? document : null);
  const canvas = env.canvas
    || (doc && typeof doc.getElementById === 'function' ? doc.getElementById('view') : null);
  const st = createInputState();

  const listen = (targets, type, info) => {
    for (const t of uniqueTargets(targets)) {
      t.addEventListener(type, (e) => {
        const r = handleEvent(st, type, info(e || {}));
        if (r.preventDefault && e && typeof e.preventDefault === 'function') e.preventDefault();
      });
    }
  };
  const key = (e) => ({ code: e.code, repeat: !!e.repeat });
  const ptr = (e) => ({ button: e.button, clientX: e.clientX });
  const none = () => ({});
  const visibility = () => ({
    hidden: !!doc && (doc.visibilityState === 'hidden' || doc.hidden === true),
  });

  listen([target], 'keydown', key);
  // keyup はどこにフォーカスがあっても取りこぼさないよう window で受ける
  listen([win, target], 'keyup', key);
  // 押しっぱなしの解除
  listen([win, target], 'blur', none);
  listen([win], 'pagehide', none);
  listen([doc], 'visibilitychange', visibility);
  // 右クリックのメニューを出さない（出ている間の keyup が届かないため）
  listen([canvas, doc], 'contextmenu', none);
  listen([target], 'pointerdown', ptr);
  listen([target], 'pointermove', ptr);
  listen([target], 'pointerup', none);
  listen([target], 'pointercancel', none);

  return {
    isDown: st.isDown,
    wasPressed: st.wasPressed,
    consumeDrag: st.consumeDrag,
    consume: st.consume,
    endFrame: st.endFrame,
    reset: st.reset,
    releaseAll: st.releaseAll,
  };
}
