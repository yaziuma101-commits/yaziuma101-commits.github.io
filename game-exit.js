// ゲームの隅に重ねる「おわる」ボタン。ゲーム本体には手を入れず、
// functions/games/_middleware.js が2本のゲームの HTML にこのファイルを読ませる（手元では tools/dev-server.mjs が同じことをする）。
// 押すと確かめてから、タクアンの島のトップのそのゲームの紹介へ戻る。タブは閉じない（ブラウザが閉じさせてくれないため）。
(function () {
  if (window.__takuanExit) return;
  window.__takuanExit = true;
  const back = location.pathname.indexOf("/games/jukusei-deck") === 0 ? "/#game-jukusei" : "/#game-shima";

  const css = `
.tk-exit-btn { position: fixed; top: 0; left: 50%; transform: translateX(-50%); z-index: 2147483000;
  font: 12px/1 "DotGothic16", "MS Gothic", monospace; color: #13237a; background: #e6eefc; padding: calc(4px + env(safe-area-inset-top)) 10px 4px; cursor: pointer;
  border: 2px solid; border-top: 0; border-color: #fff #4a5f9a #4a5f9a #fff; box-shadow: 0 0 0 1px #13237a; border-radius: 0 0 6px 6px; opacity: .7; touch-action: manipulation; }
@media (pointer: coarse) { .tk-exit-btn { font-size: 13px; padding: calc(7px + env(safe-area-inset-top)) 14px 7px; } }
.tk-exit-btn:hover, .tk-exit-btn:focus-visible { opacity: 1; background: #fff; }
.tk-exit-btn:active { border-color: #4a5f9a #fff #fff #4a5f9a; }
.tk-exit-dlg { position: fixed; inset: 0; margin: auto; height: fit-content; padding: 0; border: 2px solid #13237a; background: #fffef6; color: #13237a; max-width: min(360px, calc(100vw - 24px));
  box-shadow: 0 0 0 4px #fff, 0 0 0 6px #13237a; font: 15px/1.6 "DotGothic16", "MS Gothic", monospace; }
.tk-exit-dlg::backdrop { background: rgba(10, 18, 60, .6); }
.tk-exit-dlg h2 { margin: 0; padding: 4px 10px; font: inherit; color: #fff; background: linear-gradient(#3c6fe0, #1d43b8); }
.tk-exit-dlg p { margin: 14px 16px 4px; text-align: center; }
.tk-exit-dlg .tk-row { display: flex; gap: 12px; justify-content: center; padding: 10px 16px 16px; }
.tk-exit-dlg button { font: inherit; color: #13237a; background: #e6eefc; padding: 6px 14px; min-width: 7em; cursor: pointer;
  border: 2px solid; border-color: #fff #4a5f9a #4a5f9a #fff; box-shadow: 0 0 0 1px #13237a; }
.tk-exit-dlg button:active { border-color: #4a5f9a #fff #fff #4a5f9a; }
.tk-exit-dlg .tk-yes { color: #fff; background: #c8161d; }
`;
  const style = document.createElement("style");
  style.textContent = css;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tk-exit-btn";
  btn.textContent = "✕ おわる";
  btn.title = "ゲームをやめてタクアンの島へ戻る";

  const dlg = document.createElement("dialog");
  dlg.className = "tk-exit-dlg";
  dlg.innerHTML = '<h2>◆ おわる？</h2><p>ゲームをやめて戻りますか？<br><small>（とちゅうのところは残らないかもしれません）</small></p>' +
    '<div class="tk-row"><button type="button" class="tk-no">つづける</button><button type="button" class="tk-yes">やめて戻る</button></div>';

  // ボタンやダイアログでの操作がゲームに伝わらないようにする
  const stop = (e) => e.stopPropagation();
  ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "touchstart", "touchend", "wheel", "contextmenu"].forEach((t) => {
    btn.addEventListener(t, stop);
    dlg.addEventListener(t, stop);
  });
  window.addEventListener("keydown", (e) => { if (dlg.open) e.stopImmediatePropagation(); }, true);
  window.addEventListener("keyup", (e) => { if (dlg.open) e.stopImmediatePropagation(); }, true);

  btn.addEventListener("click", () => {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    dlg.showModal();
    dlg.querySelector(".tk-no").focus();
  });
  dlg.querySelector(".tk-no").addEventListener("click", () => dlg.close());
  dlg.querySelector(".tk-yes").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) { /* 全画面のままでも戻る */ }
    location.href = back;
  });

  function mount() {
    document.head.appendChild(style);
    document.body.append(btn, dlg);
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
