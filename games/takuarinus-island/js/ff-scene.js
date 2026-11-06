// 「ファイルを見つけろ」の場面（とうふアリヌスの絵から）。
// 3D は散らかった和室（ff-room.js）、真ん中に HTML の「モヒカンOS 98」の画面（ff-ui.js）を重ねる。
// 紹介 → 起動 → 5回戦（提出・外れの待ち・とうふアリヌスとの競争）→ 結果（もう一度／館に戻る）。
// Esc のポーズの「館に戻る」は main.js の readyRooms から自動で出る。
import { buildFfRoom } from './ff-room.js';
import {
  createFfUi, ffIntroView, FF_DESKTOP_ICONS, FF_OS_NAME, ffRoundResultView, ffFinalView, ffHudLines, ffConfirmView,
} from './ff-ui.js';
import { createMinigamePanel } from './scenes/touch.js';
import { childrenOf } from './ff-tree.js';
import { fileProperties } from './ff-clues.js';
import {
  createMatch, submit, tick, nextRound, matchResult, lockRemaining, elapsedOf,
} from './ff-match.js';
import { aiStatusText } from './ff-ai.js';
import { searchFiles } from './ff-search.js';
import {
  FUN_EVENT_DEFS, scheduleFun, trashContents, dueFunEvents, funMessage, funPopupPos, funSillyFraction,
  FF_FUN_DURATION_SEC,
} from './ff-fun.js';
import { loadSillyLevel, SILLY_STORAGE_KEY } from './silly-rules.js';
import {
  createDesktop, openWindow, getWindow, closeWindow, focusWindow, moveWindow, setView,
  openItem, goUp, goBack, moveSelection, jumpToLastOpened, winListOf,
} from './ff-nav.js';
import { ffSfx, ensureGameMusic, stopGameMusic } from './audio.js';
import { findFileItemOptions, ffMatchEffects } from './item-effects.js';
import { createPopupManager, popupSchedule, POPUP_SPAN_SEC } from './ff-popups.js';
import { junkPlan, openJunkWins, setJunkTab } from './ff-junk.js';
import { createPopupHost } from './ff-noise-ui.js';
import { smokeSummary } from './smoke-state.js';

export const FF_GAME_ID = 'find-file';
/** この場面の BGM（audio-music.js の FF_TRACKS） */
export const FF_MUSIC = 'findfile';
/** 起動画面を見せる秒数 */
export const FF_BOOT_SEC = 1.8;
/** とうふアリヌスの強さ（1〜3） */
export const FF_AI_LEVEL = 2;
/** 回が終わってから結果の小窓を出すまでの秒数（相手が先のときは万歳を見せる） */
export const FF_ROUND_END_SEC = Object.freeze({ player: 0.9, ai: 1.8 });
const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter', 'Backspace', 'Space', 'KeyB']);
/** これより古いキー入力は捨てる（ポーズ中に押したもの） */
const KEY_FRESH_MS = 250;
const PLAY_HINT = 'ダブルクリック: 開く　ドラッグで提出箱へ／選んで Enter: 提出　右クリック: メニュー　Backspace: 上へ　Esc: ポーズ';

export function createFindFileScene(ctx) {
  const input = ctx.input;
  let room = null;
  let ui = null;
  let panel = null;
  let phase = 'idle'; // idle | intro | boot | desk | roundEnd | dialog
  let t = 0;
  let phaseT = 0;
  let guard = 0;
  let leaving = false;
  let gameId = FF_GAME_ID;
  let carry = {};
  let carryLine = null;
  let rewardLine = null;
  let opts = findFileItemOptions({});
  let bookmarkLeft = 0;
  let confirming = false;
  let match = null;
  let tree = null;
  let desk = null;
  let sel = null;
  let clock = 0;
  let endDelay = 0;
  let funPlan = [];
  let funIdx = 0;
  let funSeen = {};
  let listening = false;
  const keyQueue = [];
  let popMgr = null;
  let popHost = null;
  let popEvents = [];
  let popIdx = 0;

  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const pressed = (...codes) => !!input && typeof input.wasPressed === 'function' && !!input.wasPressed(...codes);
  const live = () => phase === 'desk' && !!desk && !!tree && !!match;

  const onKey = (e) => {
    if ((phase !== 'desk' && phase !== 'dialog') || !NAV_KEYS.has(e.code)) return;
    if (e.code === 'Space' && phase !== 'dialog' && !confirming) return;
    const tg = e.target;
    if (tg && /^(INPUT|TEXTAREA)$/.test(tg.tagName || '')) return;
    e.preventDefault();
    keyQueue.push({ code: e.code, at: nowMs() });
  };
  function listen(on) {
    if (typeof window === 'undefined' || on === listening) return;
    listening = on;
    if (on) window.addEventListener('keydown', onKey);
    else window.removeEventListener('keydown', onKey);
  }

  function backToGallery() {
    if (leaving) return;
    leaving = true;
    let ok = false;
    try {
      ok = !!ctx.returnToGallery(gameId);
    } catch {
      ok = false;
    }
    if (!ok) leaving = false;
  }

  function render() {
    if (ui && desk && tree) ui.renderWins(desk, tree, sel);
  }

  /** いま手前のフォルダの窓（関係ない窓が手前なら null） */
  function focused() {
    const w = desk && desk.focusId != null ? getWindow(desk, desk.focusId) : null;
    return w && !w.junk ? w : null;
  }

  /** 広告・警告の小窓をすべて消す */
  function clearPopups() {
    if (popMgr) popMgr.clear();
    if (popHost) popHost.sync([]);
  }

  /** 予定の時刻が来た小窓を出す（回が始まってからの秒で数える） */
  function runPopups() {
    if (!popMgr || !live()) return;
    const r = dueFunEvents(popEvents, popIdx, elapsedOf(match, clock));
    popIdx = r.index;
    let changed = false;
    for (const e of r.events) {
      if (e && e.popup && popMgr.open(e.popup)) {
        changed = true;
        ffSfx(e.popup.kind === 'warn' ? 'ffError' : 'ffOpen');
      }
    }
    if (changed && popHost) popHost.sync(popMgr.list());
  }

  /** 小窓の操作（dodge・x・close・ok・body・yes・no） */
  function popPress(id, act) {
    if (!popMgr || !live()) return;
    const r = popMgr.press(id, act);
    if (r.spawned) ffSfx(act === 'body' ? 'ffError' : 'ffOpen');
    else if (r.closed) ffSfx('ffClick');
    if (popHost) popHost.sync(popMgr.list());
  }

  /** おふざけ度（既存の保存。0〜3）。0 なら小窓は出ない */
  function popupLevelNow() {
    try {
      return loadSillyLevel(globalThis.localStorage.getItem(SILLY_STORAGE_KEY));
    } catch {
      return 2;
    }
  }

  function refreshHud() {
    if (!ui || !match) return;
    ui.setHud(ffHudLines(match, clock, { highlight: opts.clueHighlight }));
    const r = match.round;
    const aiDone = r.winner === 'ai';
    ui.setAi(aiDone ? 'とうふアリヌス：見つけた！' : aiStatusText(r.ai, elapsedOf(match, clock)), aiDone);
    ui.setLocked(phase === 'desk' ? lockRemaining(match, clock) : 0);
  }

  /** おふざけ度（既存の保存）→ 0..1 */
  function sillyNow() {
    try {
      return funSillyFraction(loadSillyLevel(globalThis.localStorage.getItem(SILLY_STORAGE_KEY)));
    } catch {
      return funSillyFraction(2);
    }
  }

  function fireFun(e) {
    if (!ui || !match || !e) return;
    const n = funSeen[e.kind] || 0;
    funSeen[e.kind] = n + 1;
    if (e.kind === 'errorPopup') {
      ffSfx('ffError');
      ui.showErrorPopup(funMessage('errorPopup', match.seed, n), funPopupPos(match.seed, funIdx));
    } else if (e.kind === 'screensaver') {
      ui.closeMenus();
      ui.startScreensaver(FUN_EVENT_DEFS.screensaver.maxBlockSec * 1000);
    } else if (e.kind === 'assistant') {
      ffSfx('ffOpen');
      ui.showAssistant(funMessage('assistant', match.seed, n));
    }
  }

  /** 予定表どおりに、ゲーム内の経過時間でおふざけを起こす */
  function runFun() {
    const r = dueFunEvents(funPlan, funIdx, clock);
    funIdx = r.index;
    if (r.events.length) fireFun(r.events[r.events.length - 1]);
  }

  function onSearch(q) {
    if (!live()) return null;
    const r = searchFiles(q, match.round.seed);
    ffSfx(r.substitute ? 'ffError' : 'ffClick');
    return r;
  }

  function openMyComputer() {
    const n = winListOf(desk).length;
    openWindow(desk, tree, tree.rootId, { x: 16 + (n % 5) * 5, y: 3 + (n % 5) * 6 });
    ffSfx('ffOpen');
    sel = null;
    render();
  }

  function showProps(node) {
    if (node && node.kind === 'file') ui.showProps(fileProperties(node));
  }

  function activate(winId, nodeId) {
    const r = openItem(desk, tree, winId, nodeId);
    if (r.kind === 'folder') {
      // ドライブを開くとディスクが回る
      ffSfx(r.node && r.node.kind === 'drive' ? 'ffFloppy' : 'ffOpen');
      sel = null;
      render();
    } else if (r.kind === 'file') {
      ffSfx('ffOpen');
      showProps(r.node);
    }
  }

  // ---- 提出と回の終わり ----
  function submitNode(nodeId) {
    if (!live()) return;
    const n = tree.nodes[nodeId];
    // 動く箱：提出の前に「本当にこれ？」（待っている間は何も聞かない＝無反応のまま）
    if (opts.confirmSubmit && n && n.kind === 'file' && lockRemaining(match, clock) <= 0) {
      confirming = true;
      keyQueue.length = 0;
      ui.showDialog(ffConfirmView(n), (id) => {
        confirming = false;
        if (id === 'yes' && live()) doSubmit(nodeId);
      });
      return;
    }
    doSubmit(nodeId);
  }

  function doSubmit(nodeId) {
    if (!live()) return;
    const r = submit(match, nodeId, clock);
    if (r.result === 'correct') {
      ffSfx('ffFloppy');
      ffSfx('ffOk', 0.35);
      onRoundOver();
    } else if (r.result === 'over') {
      onRoundOver();
    } else if (r.result === 'wrong') {
      ffSfx('ffFloppy');
      ffSfx('ffNg', 0.35);
      ctx.ui.toast(`ちがうファイルだ！ ${Math.ceil(lockRemaining(match, clock))}秒 待ち`, 1.6);
      refreshHud();
    } else if (r.result === 'invalid') {
      ffSfx('ffError');
      ctx.ui.toast('フォルダは提出できません', 1.4);
    }
    // 'locked'：砂時計の間は提出箱は無反応
  }

  function onRoundOver() {
    if (!match || !match.round.over || !match.results.length) return;
    const res = match.results[match.results.length - 1];
    phase = 'roundEnd';
    phaseT = 0;
    sel = null;
    keyQueue.length = 0;
    if (confirming) {
      confirming = false;
      ui.hideDialog();
    }
    ui.closeMenus();
    ui.hideProps();
    ui.clearFun();
    ui.hideSearch();
    ui.hideTrash();
    clearPopups();
    if (res.winner === 'player') {
      endDelay = FF_ROUND_END_SEC.player;
      room.setMood({ hero: 'joy' });
      ctx.ui.toast(`正解！ +${res.points}点`, 1.6);
    } else {
      endDelay = FF_ROUND_END_SEC.ai;
      ffSfx('ffError');
      room.setMood({ tofu: 'banzai' });
      ctx.ui.toast(`とうふアリヌスが先に見つけた！ 相手に +${res.points}点`, 2);
    }
    render();
    refreshHud();
    ctx.ui.setHint('');
  }

  function showRoundDialog() {
    phase = 'dialog';
    keyQueue.length = 0;
    if (match.phase === 'finished') {
      showFinal();
      return;
    }
    ui.showDialog(ffRoundResultView(match), () => goNext());
    ctx.ui.setHint('Enter / クリック: 次へ');
  }

  function goNext() {
    if (!match || !nextRound(match, clock)) return;
    room.setMood({});
    beginRound();
  }

  function showFinal() {
    const res = matchResult(match);
    rewardLine = null;
    if (res === 'win') {
      try {
        const got = ctx.grantGameItem(gameId);
        if (got && got.item && got.isNew) {
          rewardLine = `アイテム獲得：${got.item.name}`;
          ctx.ui.banner(rewardLine, 3);
          ffSfx('ffFloppy', 0.4);
        }
      } catch {
        rewardLine = null;
      }
      room.setMood({ hero: 'joy' });
    } else if (res === 'lose') {
      room.setMood({ tofu: 'banzai' });
    } else {
      room.setMood({});
    }
    ui.showDialog(ffFinalView(match, [carryLine, rewardLine]), (id) => {
      if (id === 'again') startMatch();
      else backToGallery();
    });
    ctx.ui.setHint('←→: 選ぶ　Enter: 決定');
  }

  function beginRound() {
    tree = match.round.tree;
    desk = createDesktop();
    // 始まりは関係ない窓がたくさん開いている（たまに当たりの情報入り）
    try {
      openJunkWins(desk, tree, junkPlan(tree, match.round.seed));
    } catch (err) {
      console.warn(err);
    }
    popMgr = createPopupManager(match.round.seed);
    popEvents = popupSchedule(match.round.seed, popupLevelNow(), POPUP_SPAN_SEC);
    popIdx = 0;
    if (popHost) popHost.sync([]);
    sel = null;
    keyQueue.length = 0;
    phase = 'desk';
    phaseT = 0;
    ui.hideDialog();
    ui.hideProps();
    ui.closeMenus();
    ui.clearFun();
    ui.hideSearch();
    ui.hideTrash();
    render();
    refreshHud();
    ffSfx('ffFloppy');
    ctx.ui.setHint(bookmarkLeft > 0 ? `${PLAY_HINT}　B: しおり` : PLAY_HINT);
  }

  function startMatch() {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    match = createMatch({ seed, aiLevel: carry.hard ? 3 : FF_AI_LEVEL, effects: ffMatchEffects(opts) });
    bookmarkLeft = opts.bookmark;
    confirming = false;
    ui.setBookmark(bookmarkLeft);
    clock = 0;
    funPlan = scheduleFun(seed, sillyNow(), FF_FUN_DURATION_SEC);
    funIdx = 0;
    funSeen = {};
    rewardLine = null;
    room.setMood({});
    ui.setScreen('on');
    beginRound();
  }

  const rawActions = {
    onWinFocus(id) {
      if (desk.focusId !== id && focusWindow(desk, id)) render();
    },
    onWinClose(id) {
      closeWindow(desk, id);
      if (sel && sel.winId === id) sel = null;
      render();
    },
    onWinMove(id, x, y) {
      moveWindow(desk, id, x, y);
      render();
    },
    onWinBack(id) {
      if (goBack(desk, id)) {
        sel = null;
        render();
      }
    },
    onWinUp(id) {
      if (goUp(desk, tree, id)) {
        sel = null;
        render();
      }
    },
    onWinView(id, v) {
      setView(desk, id, v);
      render();
    },
    onItemSelect(winId, nodeId) {
      ffSfx('ffClick');
      sel = { winId, nodeId };
      render();
    },
    onItemOpen(winId, nodeId) {
      activate(winId, nodeId);
    },
    onItemSubmit(winId, nodeId) {
      submitNode(nodeId);
    },
    onItemMenu(act, winId, nodeId) {
      if (act === 'open') activate(winId, nodeId);
      else if (act === 'props') showProps(tree.nodes[nodeId]);
      else if (act === 'submit') submitNode(nodeId);
    },
    onJunkTab(winId, idx) {
      if (setJunkTab(desk, winId, idx)) {
        ffSfx('ffClick');
        render();
      }
    },
    onDeskClick(iconId) {
      if (iconId) ffSfx('ffClick');
      // 提出箱のダブルクリックで選んだファイルを出せるよう、提出箱では選択を外さない
      if (sel && iconId !== 'submit') {
        sel = null;
        render();
      }
    },
  };
  const actions = Object.fromEntries(Object.entries(rawActions).map(([k, fn]) => [k, (...a) => {
    if (live()) fn(...a);
  }]));

  /** しおり：1回だけ直前に開いたフォルダへ戻る */
  function useBookmark() {
    if (!live() || bookmarkLeft <= 0 || confirming) return;
    const w = focused();
    if (!w) {
      ffSfx('ffError');
      ctx.ui.toast('窓を開いてから、しおりを使おう', 1.6);
      return;
    }
    if (jumpToLastOpened(desk, tree, w.id)) {
      bookmarkLeft -= 1;
      ui.setBookmark(bookmarkLeft);
      ffSfx('ffOpen');
      sel = null;
      render();
      ctx.ui.toast('しおり！ 直前に開いたフォルダへ戻った', 1.6);
      if (bookmarkLeft <= 0) ctx.ui.setHint(PLAY_HINT);
    } else {
      ffSfx('ffError');
      ctx.ui.toast('まだ戻れるフォルダがない', 1.4);
    }
  }

  function handleKey(code) {
    if (phase === 'dialog' || confirming) {
      ffSfx('ffClick');
      if (code === 'ArrowLeft' || code === 'ArrowUp') ui.dialogMove(-1);
      else if (code === 'ArrowRight' || code === 'ArrowDown') ui.dialogMove(1);
      else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') ui.dialogConfirm();
      return;
    }
    if (!live()) return;
    if (code === 'KeyB') {
      useBookmark();
      return;
    }
    const w = focused();
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (!w) {
        openMyComputer();
        return;
      }
      if (sel && sel.winId === w.id && tree.nodes[sel.nodeId]) {
        const n = tree.nodes[sel.nodeId];
        if (n.kind === 'file') submitNode(n.id);
        else activate(w.id, n.id);
      }
      return;
    }
    if (!w) return;
    if (code === 'Backspace') {
      if (goUp(desk, tree, w.id)) {
        ffSfx('ffClick');
        sel = null;
        render();
      }
      return;
    }
    if (code === 'Space') return;
    const delta = code === 'ArrowUp' || code === 'ArrowLeft' ? -1 : 1;
    const cur = sel && sel.winId === w.id ? sel.nodeId : null;
    const next = moveSelection(childrenOf(tree, w.folderId), cur, delta);
    if (next) {
      if (next !== cur) ffSfx('ffClick');
      sel = { winId: w.id, nodeId: next };
      render();
    }
  }

  function startBoot() {
    if (phase !== 'intro') return;
    phase = 'boot';
    phaseT = 0;
    ui.setScreen('boot');
    ffSfx('ffBoot');
    ui.setHud(`${FF_OS_NAME} を起動中…`);
    ctx.ui.setHint('');
  }

  function onIconOpen(id) {
    if (!live()) return;
    if (id === 'mycomputer') {
      openMyComputer();
      return;
    }
    if (id === 'submit') {
      const n = sel ? tree.nodes[sel.nodeId] : null;
      if (n && n.kind === 'file') submitNode(n.id);
      else {
        ffSfx('ffError');
        ctx.ui.toast('ファイルを提出箱へドラッグしよう（選んで Enter でも提出できる）', 2);
      }
      return;
    }
    if (id === 'search') {
      ffSfx('ffOpen');
      ui.showSearch();
      return;
    }
    if (id === 'trash') {
      ffSfx('ffOpen');
      ui.showTrash(trashContents());
      return;
    }
    const ic = FF_DESKTOP_ICONS.find((x) => x.id === id);
    if (ic) {
      ffSfx('ffError');
      ctx.ui.toast(`「${ic.label}」は開けません`, 1.5);
    }
  }

  function onStartItem(id) {
    if (id === 'about') ctx.ui.toast(`${FF_OS_NAME}　とうふ印のパソコン用`, 2);
    else if (id === 'shutdown') {
      ffSfx('ffError');
      ctx.ui.toast('シャットダウンできません。とうふアリヌスが見ています', 2);
    }
  }

  return {
    enter(params = {}) {
      const p = params && typeof params === 'object' ? params : {};
      if (!room) room = buildFfRoom(ctx);
      gameId = typeof p.gameId === 'string' && p.gameId ? p.gameId : FF_GAME_ID;
      carry = p.carry && typeof p.carry === 'object' ? p.carry : {};
      carryLine = ctx.carryEffectFor(gameId) || null;
      opts = findFileItemOptions(carry);
      bookmarkLeft = 0;
      confirming = false;
      leaving = false;
      t = 0;
      phaseT = 0;
      guard = 0.3;
      match = null;
      tree = null;
      desk = null;
      sel = null;
      clock = 0;
      room.setMood({});
      room.setMohawk(ctx.mohawkColor());
      ctx.setWorld(room.world);
      room.placeCamera(ctx.camera, 0);
      ctx.ui.refreshHud();
      ctx.ui.setHint('');
      if (!ui) {
        ui = createFfUi({
          onIconOpen, onStartItem, actions, sfx: ffSfx, onSearch, onBookmark: () => useBookmark(),
        });
      }
      ui.mount();
      if (!popHost) popHost = createPopupHost(ui.popupLayer(), { onPress: (id, act) => popPress(id, act) });
      ui.setDoubleClickMs(opts.doubleClickMs);
      ui.setBookmark(0);
      ui.setScreen('off');
      ui.setHud(null);
      ui.setAi(null);
      ui.tick();
      listen(true);
      if (!panel) panel = createMinigamePanel();
      phase = 'intro';
      panel.show(ffIntroView(carryLine), () => startBoot());
    },
    update(dt) {
      if (!room) return;
      ensureGameMusic(FF_MUSIC);
      const d = Math.min(Number.isFinite(dt) && dt > 0 ? dt : 0, 0.1);
      t += d;
      phaseT += d;
      guard = Math.max(0, guard - d);
      if (phase === 'intro') {
        if (pressed('Escape')) {
          if (panel) panel.hide();
          backToGallery();
          if (!leaving) panel.show(ffIntroView(carryLine), () => startBoot());
        } else if (guard <= 0 && pressed('Enter', 'NumpadEnter', 'Space')) {
          if (panel) panel.close();
        }
      } else if (phase === 'boot') {
        if (phaseT >= FF_BOOT_SEC) startMatch();
      } else if (phase === 'desk' || phase === 'roundEnd' || phase === 'dialog') {
        const now = nowMs();
        while (keyQueue.length) {
          const k = keyQueue.shift();
          if (now - k.at <= KEY_FRESH_MS) handleKey(k.code);
        }
        if (phase === 'desk') {
          clock += d;
          runPopups();
          if (tick(match, clock)) onRoundOver();
        } else if (phase === 'roundEnd' && phaseT >= endDelay) {
          showRoundDialog();
        }
        refreshHud();
      }
      if (ui) ui.tick();
      room.update(t, d);
      room.placeCamera(ctx.camera, t);
    },
    // 試し遊び用の状態（window.__smoke.state() が読む）
    smokeState() {
      return { phase, t, clock, match: smokeSummary(match), opts: smokeSummary(opts) };
    },
    exit() {
      phase = 'idle';
      confirming = false;
      stopGameMusic(FF_MUSIC);
      listen(false);
      keyQueue.length = 0;
      if (panel) panel.hide();
      clearPopups();
      popMgr = null;
      if (ui) ui.unmount();
      if (room) room.setMood({});
      desk = null;
      sel = null;
      match = null;
      ctx.ui.setHint('');
    },
    get pausable() { return phase !== 'intro'; },
    get carry() { return carry; },
  };
}

export default createFindFileScene;
