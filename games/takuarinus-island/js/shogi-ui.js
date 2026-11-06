// スーパー将棋の HTML の盤・持ち駒台・成りの選択・結果（DOM の薄い利用者）。
// 作るときには DOM に触らない（mount で要素を作る）。駒の表記などの小さな規則は純粋な関数で公開する。
import { PALETTE } from './palette.js';
import { handEntries } from './shogi-rules.js';
import {
  DEFAULT_NAMES, MAX_CUSTOM_COST, customCost, coveredCells, validateCustomName, validateCustomDef,
  normalizeCustomDef, toggleCell, toggleRay,
} from './shogi-custom.js';

export const PIECE_KANJI = Object.freeze({
  P: '歩', L: '香', N: '桂', S: '銀', G: '金', B: '角', R: '飛',
});
export const PROMOTED_KANJI = Object.freeze({
  P: 'と', L: '杏', N: '圭', S: '全', B: '馬', R: '龍',
});

export const isCustomType = (t) => t === 'C0' || t === 'C1';
export const sqKey = (x, y) => `${x},${y}`;

/** 駒の文字を表示用に分ける（1文字はそのまま、2文字以上は先頭2文字を縦に並べる） */
export function pieceTextParts(label) {
  const chars = [...String(label ?? '')];
  if (chars.length <= 1) return chars;
  return chars.slice(0, 2);
}

/**
 * 駒の要素に文字を入れる。2文字のときは1文字ずつの span（.sg-ch）を縦に並べる
 * （writing-mode は使わない。盤のマスを押し広げないため）。返り値は文字数
 */
export function fillPieceText(doc, node, label) {
  const parts = pieceTextParts(label);
  node.textContent = '';
  if (parts.length > 1) {
    for (const ch of parts) {
      const s = doc.createElement('span');
      s.className = 'sg-ch';
      s.textContent = ch;
      node.append(s);
    }
  } else {
    node.textContent = parts[0] || '';
  }
  return parts.length;
}

/** 駒の表記（先手の玉は「玉」、後手は「王」。自作駒は名前） */
export function pieceLabel(piece, customs = null) {
  if (!piece) return '';
  const { type, side, promoted } = piece;
  if (type === 'K') return side === 'w' ? '王' : '玉';
  if (isCustomType(type)) {
    const d = Array.isArray(customs) ? customs[type === 'C0' ? 0 : 1] : null;
    return d && typeof d.name === 'string' && d.name ? d.name : '？';
  }
  if (promoted && PROMOTED_KANJI[type]) return PROMOTED_KANJI[type];
  return PIECE_KANJI[type] || '？';
}

/** 選んだもの（盤上 {x,y} か持ち駒 {hand:type}）から指せる手 */
export function selectionMoves(moves, sel) {
  if (!sel || !Array.isArray(moves)) return [];
  if (sel.hand) return moves.filter((m) => m.drop === sel.hand);
  return moves.filter((m) => m.from && m.from.x === sel.x && m.from.y === sel.y);
}

/** 「待った」ボタンの表示（残り回数つき） */
export function undoButtonView(undosLeft, enabled) {
  const n = Number.isFinite(Number(undosLeft)) && Number(undosLeft) > 0 ? Math.floor(Number(undosLeft)) : 0;
  return { label: `待った（残り${n}）`, disabled: !enabled || n <= 0 };
}

/** 「水鉄砲」ボタンの表示。left が null なら出さない */
export function washButtonView(left, active, enabled) {
  if (left === null || left === undefined) return { hidden: true, label: '', disabled: true, on: false };
  const n = Number.isFinite(Number(left)) && Number(left) > 0 ? Math.floor(Number(left)) : 0;
  return {
    hidden: false,
    label: active ? '水鉄砲：押し流す駒を選んで' : `水鉄砲（残り${n}）`,
    disabled: !active && (n <= 0 || !enabled),
    on: !!active,
  };
}

/** 相手の強さの表示名 */
export const SHOGI_LEVEL_LABELS = Object.freeze({ easy: '弱い', normal: 'ふつう', hard: '強い' });
const LEVEL_ORDER = Object.freeze(['easy', 'normal', 'hard']);
const LEVEL_NOTES = Object.freeze({
  easy: '弱い：1手先だけ見る。ときどきうっかりする',
  normal: 'ふつう：2手先まで読む',
  hard: '強い：取り合いの先まで読む',
});

/** 強さの表示名（未知は「ふつう」） */
export function levelLabel(level) {
  return SHOGI_LEVEL_LABELS[level] || SHOGI_LEVEL_LABELS.normal;
}

// ---- おふざけ（おふざけ度 0〜3 に合わせる。どれも入力を奪わない） ----
/** おなすくんが転がる時間（秒） */
export const NASU_ROLL_SECONDS = 1.2;
/** 「王手ッ！」が出ている時間（秒） */
export const OUTE_SECONDS = 0.8;
/** モヒフライが盤を横切る時間（秒。2 秒以内） */
export const FLY_SECONDS = 1.8;
/** 1手ごとにモヒフライが出る確率（おふざけ度ごと） */
export const FLY_CHANCE = Object.freeze([0, 0, 0.15, 0.35]);

/** おふざけ度を 0〜3 の整数にそろえる（読めなければ 0） */
export function normalizeShogiSilly(level) {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, n));
}

/**
 * 1手ぶんのおふざけの計画。rng は () => [0,1)。
 * { level, nasu（ナスーッ！＋転がる）, oute（王手ッ！）, fly（モヒフライ）, flyTop（横切る高さ %） }
 */
export function shogiSillyPlan(level, { captured = false, inCheck = false } = {}, rng = Math.random) {
  const lv = normalizeShogiSilly(level);
  const r = () => {
    const v = typeof rng === 'function' ? Number(rng()) : 1;
    return Number.isFinite(v) ? v : 1;
  };
  const out = {
    level: lv, nasu: false, oute: false, fly: false, flyTop: 50,
  };
  if (lv <= 0) return out;
  out.nasu = !!captured;
  out.oute = !!inCheck;
  if (lv >= 3 && captured) out.fly = true;
  else if (FLY_CHANCE[lv] > 0) out.fly = r() < FLY_CHANCE[lv];
  if (out.fly) out.flyTop = Math.round(20 + r() * 55);
  return out;
}

/** おなすくんの転がり（経過秒 → 角度・横のずれ）。NASU_ROLL_SECONDS で終わる */
export function nasuRollPose(elapsed) {
  const e = Number(elapsed);
  const tt = Number.isFinite(e) && e > 0 ? e : 0;
  const p = Math.min(1, tt / NASU_ROLL_SECONDS);
  const done = tt >= NASU_ROLL_SECONDS;
  return {
    done,
    angle: done ? 0 : -2 * Math.PI * p,
    dx: done ? 0 : Math.sin(p * Math.PI) * 1.1,
  };
}

/** 強さ選択の画面の中身。いまの強さ（未知は normal）を選んだ状態にする */
export function shogiLevelView(level) {
  const cur = LEVEL_ORDER.includes(level) ? level : 'normal';
  return {
    title: 'おなすくんの強さ',
    lines: [...LEVEL_ORDER.map((l) => LEVEL_NOTES[l]), '（1・2・3 のキーでも選べる）'],
    choices: LEVEL_ORDER.map((id) => ({ id, label: SHOGI_LEVEL_LABELS[id] })),
    selected: LEVEL_ORDER.indexOf(cur),
  };
}

const STYLE_ID = 'shogi-style';

/** 盤・駒の CSS（テスト用に公開） */
export function shogiUiCss() {
  return css();
}

/** 駒工房の CSS（テスト用に公開） */
export function shogiWorkshopCss() {
  return wsCss();
}

function css() {
  const P = PALETTE;
  const sys = 'system-ui,"Hiragino Maru Gothic ProN","Meiryo",sans-serif';
  return `
#shogi-ui{position:fixed;inset:0;pointer-events:none;z-index:12;font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;color:${P.uiText};user-select:none}
#shogi-ui button{font:inherit}
#shogi-ui .sg-board{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);width:min(56vw,80vh);height:min(56vw,80vh);display:grid;grid-template-columns:repeat(9,minmax(0, 1fr));grid-template-rows:repeat(9,minmax(0, 1fr));background:${P.shogiBoard};border:min(1vw,1.3vh) solid ${P.shogiBoardEdge};box-shadow:0 6px 0 ${P.uiShade};pointer-events:auto;box-sizing:border-box}
#shogi-ui.ended .sg-board{opacity:.55}
#shogi-ui .sg-cell{position:relative;border:1px solid ${P.shogiLine};display:flex;align-items:center;justify-content:center;cursor:pointer;box-sizing:border-box;min-width:0;min-height:0;overflow:hidden}
#shogi-ui .sg-cell.last{background:${P.shogiLast}}
#shogi-ui .sg-cell.sel{background:${P.uiGold}}
#shogi-ui .sg-cell.target{box-shadow:inset 0 0 0 min(.5vw,.7vh) ${P.uiGood}}
#shogi-ui .sg-cell.target:empty::after{content:"";position:absolute;inset:32%;border-radius:50%;background:${P.uiGood};box-shadow:0 0 8px ${P.uiGood};pointer-events:none}
#shogi-ui .sg-cell.cursor{outline:3px solid ${P.uiAccent};outline-offset:-3px}
#shogi-ui .sg-piece{width:86%;height:92%;display:flex;align-items:center;justify-content:center;clip-path:polygon(50% 0,86% 15%,100% 100%,0 100%,14% 15%);background:${P.pieceFace};color:${P.pieceInk};font-weight:900;font-size:min(3.4vw,4.8vh);line-height:1;padding-top:14%;box-sizing:border-box;pointer-events:none}
#shogi-ui .sg-piece.w{transform:rotate(180deg)}
#shogi-ui .sg-piece.promoted{color:${P.piecePromoted}}
#shogi-ui .sg-piece.custom{background:${P.pieceCustom}}
#shogi-ui .sg-piece.custom.c1{background:${P.castPink}}
#shogi-ui .sg-piece.two{flex-direction:column;font-size:min(1.9vw,2.6vh);padding-top:12%}
#shogi-ui .sg-ch{display:block;line-height:1.02}
#shogi-ui .sg-hand{position:absolute;pointer-events:auto;padding:8px 10px;background:${P.uiPanel};border:3px solid ${P.uiBorder};border-radius:12px;box-shadow:0 4px 0 ${P.uiShade};max-width:17vw;min-width:9vw}
#shogi-ui .sg-hand.w{left:1.5vw;top:9vh}
#shogi-ui .sg-hand.b{right:1.5vw;bottom:10vh}
#shogi-ui .sg-hand-name{font:800 min(1.5vw,2.3vh) ${sys};color:${P.uiGold};margin-bottom:4px}
#shogi-ui .sg-chips{display:flex;flex-wrap:wrap;gap:6px}
#shogi-ui .sg-chip{position:relative;width:min(4.4vw,6.2vh);height:min(4.8vw,6.8vh);display:flex;align-items:center;justify-content:center;background:none;border:2px solid transparent;border-radius:6px;padding:0;cursor:pointer}
#shogi-ui .sg-chip.sel{border-color:${P.uiGold};background:${P.uiShade}}
#shogi-ui .sg-chip .sg-piece{width:92%;height:96%;font-size:min(2.6vw,3.6vh)}
#shogi-ui .sg-chip .sg-piece.two{font-size:min(1.5vw,2.1vh)}
#shogi-ui .sg-count{position:absolute;right:-5px;bottom:-5px;background:${P.uiAccent};color:${P.uiText};font:800 min(1.3vw,1.9vh)/1 ${sys};padding:2px 4px;border-radius:8px}
#shogi-ui .sg-none{font:700 min(1.3vw,1.9vh) ${sys};color:${P.uiDim}}
#shogi-ui .sg-status{position:absolute;right:1.5vw;top:3vh;padding:6px 14px;background:${P.uiPanel};border:3px solid ${P.uiBorder};border-radius:10px;font:800 min(1.6vw,2.4vh) ${sys};white-space:pre}
#shogi-ui .sg-think{position:absolute;left:50%;top:1vh;transform:translateX(-50%);padding:2px 12px;background:${P.uiPanel};border:2px solid ${P.uiBorder};border-radius:12px;font:800 min(1.5vw,2.2vh) ${sys};color:${P.uiGold}}
#shogi-ui .sg-buttons{position:absolute;right:1.5vw;top:12vh;pointer-events:auto;display:flex;gap:8px}
#shogi-ui .sg-btn{padding:6px 14px;background:${P.uiShade};color:${P.uiText};border:3px solid ${P.uiBorder};border-radius:10px;font:800 min(1.5vw,2.2vh) ${sys};cursor:pointer}
#shogi-ui .sg-btn:not(:disabled):hover{background:${P.uiAccent}}
#shogi-ui .sg-btn:disabled{opacity:.45;cursor:not-allowed}
#shogi-ui .sg-btn.on{background:${P.splash};color:${P.uiShade};border-color:${P.uiGold}}
#shogi-ui .sg-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:auto;background:${P.uiPanel};border:4px solid ${P.uiBorder};border-radius:16px;padding:18px 28px;text-align:center;box-shadow:0 6px 0 ${P.uiShade};font-family:${sys};min-width:min(40vw,420px)}
#shogi-ui .sg-panel h2{margin:0 0 10px;font-size:min(3.6vw,5vh)}
#shogi-ui .sg-panel h2.good{color:${P.uiGood}}
#shogi-ui .sg-panel h2.bad{color:${P.uiBad}}
#shogi-ui .sg-panel p{margin:6px 0;font-size:min(1.8vw,2.6vh);font-weight:700}
#shogi-ui .sg-choices{display:flex;gap:12px;justify-content:center;margin-top:14px;flex-wrap:wrap}
#shogi-ui .sg-choice{padding:8px 18px;background:${P.uiShade};color:${P.uiText};border:3px solid ${P.uiDim};border-radius:10px;font-weight:800;font-size:min(1.8vw,2.6vh);cursor:pointer}
#shogi-ui .sg-choice.sel{border-color:${P.uiGold};background:${P.uiAccent}}
#shogi-ui .sg-fx{position:absolute;pointer-events:none;z-index:5}
#shogi-ui .sg-nasu{left:60%;top:2vh;padding:6px 18px;background:${P.uiText};color:${P.nasuBody};border:4px solid ${P.nasuDark};border-radius:18px;font:900 min(3vw,4.4vh) ${sys};white-space:nowrap;animation:sg-nasu 1.2s ease-out forwards}
#shogi-ui .sg-nasu::after{content:"";position:absolute;left:18%;bottom:-18px;border:9px solid transparent;border-top-color:${P.nasuDark}}
@keyframes sg-nasu{0%{transform:scale(.3) rotate(-10deg);opacity:0}15%{transform:scale(1.15) rotate(4deg);opacity:1}30%{transform:scale(1) rotate(-3deg)}80%{opacity:1}100%{transform:translateY(-10px);opacity:0}}
#shogi-ui .sg-oute{left:50%;top:45%;font-size:min(12vw,17vh);font-weight:900;color:${P.piecePromoted};-webkit-text-stroke:3px ${P.uiText};text-shadow:0 6px 0 ${P.uiShade};white-space:nowrap;transform:translate(-50%,-50%);animation:sg-oute .8s ease-out forwards}
@keyframes sg-oute{0%{transform:translate(-50%,-50%) scale(2.2);opacity:0}20%{transform:translate(-50%,-50%) scale(.95);opacity:1}35%{transform:translate(-50%,-50%) scale(1.05)}75%{opacity:1}100%{transform:translate(-50%,-50%) scale(1.1);opacity:0}}
#shogi-ui .sg-fly{left:16%;width:min(5vw,7vh);height:min(5vw,7vh);margin-top:-2.5vh;animation:sg-fly 1.8s linear forwards}
#shogi-ui .sg-fly-body{position:absolute;inset:18% 26%;background:repeating-linear-gradient(90deg,${P.castFry} 0 28%,${P.castFryDark} 28% 38%);clip-path:polygon(30% 100%,70% 100%,100% 0,0 0);animation:sg-bob .25s ease-in-out infinite alternate}
#shogi-ui .sg-fly-wing{position:absolute;top:8%;width:38%;height:34%;background:${P.uiText};opacity:.85;border-radius:50%;animation:sg-flap .08s linear infinite alternate}
#shogi-ui .sg-fly-wing.l{left:0;transform-origin:100% 100%}
#shogi-ui .sg-fly-wing.r{right:0;transform-origin:0 100%}
@keyframes sg-fly{0%{left:16%;opacity:0}10%{opacity:1}90%{opacity:1}100%{left:80%;opacity:0}}
@keyframes sg-bob{0%{transform:translateY(-8%)}100%{transform:translateY(8%)}}
@keyframes sg-flap{0%{transform:scaleY(1)}100%{transform:scaleY(.3)}}
`;
}

/**
 * handlers: { onSquare(x,y), onHand(side,type), onResign() }
 */
export function createShogiUi(handlers = {}, env = {}) {
  const doc = env.doc || (typeof document !== 'undefined' ? document : null);
  let root = null;
  let boardEl = null;
  let cells = [];
  const hands = {};
  let statusEl = null;
  let thinkEl = null;
  let undoEl = null;
  let washEl = null;
  let promoteEl = null;
  let promoteCb = null;
  let resultEl = null;
  let resultCb = null;
  let resultChoices = [];
  let resultButtons = [];
  let resultSel = 0;
  const fxTimers = new Set();

  /** 入力を奪わない飾り（pointer-events:none）を ms だけ出す */
  function fx(cls, text, ms, style) {
    if (!root || !doc) return null;
    for (const old of [...root.querySelectorAll(`.${cls}`)]) old.remove();
    const e = el('div', `sg-fx ${cls}`, text);
    e.style.animationDuration = `${ms}ms`;
    if (style) Object.assign(e.style, style);
    root.append(e);
    const id = setTimeout(() => {
      fxTimers.delete(id);
      e.remove();
    }, ms + 50);
    fxTimers.add(id);
    return e;
  }

  function clearFx() {
    for (const id of fxTimers) clearTimeout(id);
    fxTimers.clear();
    if (root) for (const e of [...root.querySelectorAll('.sg-fx')]) e.remove();
  }

  function showNasu() {
    fx('sg-nasu', 'ナスーッ！', Math.round(NASU_ROLL_SECONDS * 1000));
  }

  function showOute() {
    fx('sg-oute', '王手ッ！', Math.round(OUTE_SECONDS * 1000));
  }

  function showFly(topPct = 50) {
    const top = Number.isFinite(Number(topPct)) ? Math.max(10, Math.min(90, Number(topPct))) : 50;
    const e = fx('sg-fly', undefined, Math.round(FLY_SECONDS * 1000), { top: `${top}%` });
    if (e) e.append(el('div', 'sg-fly-wing l'), el('div', 'sg-fly-wing r'), el('div', 'sg-fly-body'));
  }

  const call = (name, ...a) => {
    const fn = handlers[name];
    if (typeof fn !== 'function') return;
    try {
      fn(...a);
    } catch (err) {
      console.warn(err);
    }
  };
  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  function ensureStyle() {
    if (doc.getElementById(STYLE_ID)) return;
    const s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css();
    (doc.head || doc.body).append(s);
  }

  function mount() {
    if (root || !doc || !doc.body) return;
    ensureStyle();
    root = el('div');
    root.id = 'shogi-ui';
    boardEl = el('div', 'sg-board');
    cells = [];
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const c = el('div', 'sg-cell');
        c.addEventListener('click', () => call('onSquare', x, y));
        boardEl.append(c);
        cells.push(c);
      }
    }
    for (const [side, name] of [['w', 'おなすくんの持ち駒'], ['b', 'あなたの持ち駒']]) {
      const box = el('div', `sg-hand ${side}`);
      const chips = el('div', 'sg-chips');
      box.append(el('div', 'sg-hand-name', name), chips);
      hands[side] = { box, chips, key: null };
    }
    statusEl = el('div', 'sg-status');
    thinkEl = el('div', 'sg-think', 'ンム…');
    thinkEl.style.display = 'none';
    const btns = el('div', 'sg-buttons');
    undoEl = el('button', 'sg-btn', undoButtonView(0, false).label);
    undoEl.type = 'button';
    undoEl.disabled = true;
    undoEl.addEventListener('click', () => call('onUndo'));
    const resign = el('button', 'sg-btn', '投了');
    resign.type = 'button';
    resign.addEventListener('click', () => call('onResign'));
    washEl = el('button', 'sg-btn', '水鉄砲');
    washEl.type = 'button';
    washEl.style.display = 'none';
    washEl.addEventListener('click', () => call('onWash'));
    btns.append(washEl, undoEl, resign);
    root.append(boardEl, hands.w.box, hands.b.box, statusEl, thinkEl, btns);
    doc.body.append(root);
  }

  function unmount() {
    hidePromote();
    hideResult();
    clearFx();
    if (root) root.remove();
    root = null;
    undoEl = null;
    washEl = null;
    cells = [];
  }

  function paintPiece(holder, piece, customs, extra = '') {
    const label = pieceLabel(piece, customs);
    const key = piece ? `${piece.side}${piece.type}${piece.promoted ? '+' : ''}${label}${extra}` : '';
    if (holder.dataset.pk === key) return;
    holder.dataset.pk = key;
    for (const ch of [...holder.querySelectorAll('.sg-piece')]) ch.remove();
    if (!piece) return;
    let cls = `sg-piece ${piece.side}`;
    if (piece.promoted) cls += ' promoted';
    if (isCustomType(piece.type)) cls += ` custom ${piece.type === 'C1' ? 'c1' : 'c0'}`;
    if (pieceTextParts(label).length > 1) cls += ' two';
    const node = el('div', cls);
    fillPieceText(doc, node, label);
    holder.prepend(node);
  }

  function renderHand(side, state, sel) {
    const h = hands[side];
    const entries = handEntries(state.hands[side]);
    const selType = side === 'b' && sel && sel.hand ? sel.hand : '';
    const key = `${entries.map(([t, n]) => `${t}${n}`).join('')}|${selType}`;
    if (h.key === key) return;
    h.key = key;
    h.chips.textContent = '';
    if (!entries.length) {
      h.chips.append(el('span', 'sg-none', '（なし）'));
      return;
    }
    for (const [type, count] of entries) {
      const b = el('button', `sg-chip${selType === type ? ' sel' : ''}`);
      b.type = 'button';
      paintPiece(b, { type, side, promoted: false }, state.customs);
      if (count > 1) b.append(el('span', 'sg-count', `×${count}`));
      b.addEventListener('click', () => call('onHand', side, type));
      h.chips.append(b);
    }
  }

  /** view: { state, selected, targets:Set<"x,y">, cursor, lastMove, status, thinking } */
  function render(view) {
    if (!root || !view || !view.state) return;
    const { state } = view;
    const sel = view.selected || null;
    const targets = view.targets instanceof Set ? view.targets : new Set();
    const lm = view.lastMove;
    for (let i = 0; i < 81; i++) {
      const x = i % 9;
      const y = (i - x) / 9;
      let cls = 'sg-cell';
      if (targets.has(sqKey(x, y))) cls += ' target';
      if (sel && !sel.hand && sel.x === x && sel.y === y) cls += ' sel';
      if (lm && lm.to && lm.to.x === x && lm.to.y === y) cls += ' last';
      if (view.cursor && view.cursor.x === x && view.cursor.y === y) cls += ' cursor';
      cells[i].className = cls;
      paintPiece(cells[i], state.board[i], state.customs);
    }
    // 持ち駒は customs が変わると名前が変わるので毎回キーを作り直す
    hands.b.key = view.forceHands ? null : hands.b.key;
    hands.w.key = view.forceHands ? null : hands.w.key;
    renderHand('b', state, sel);
    renderHand('w', state, sel);
    statusEl.textContent = view.status || '';
    thinkEl.style.display = view.thinking ? '' : 'none';
    if (undoEl) {
      const u = undoButtonView(view.undosLeft, !!view.canUndo);
      if (undoEl.textContent !== u.label) undoEl.textContent = u.label;
      undoEl.disabled = u.disabled;
    }
    if (washEl) {
      const w = washButtonView(view.washLeft, !!view.washMode, !!view.canWash);
      washEl.style.display = w.hidden ? 'none' : '';
      if (washEl.textContent !== w.label) washEl.textContent = w.label;
      washEl.disabled = w.disabled;
      washEl.classList.toggle('on', w.on);
    }
  }

  function showPromote(cb) {
    hidePromote();
    if (!root) {
      if (typeof cb === 'function') cb(false);
      return;
    }
    promoteCb = cb;
    promoteEl = el('div', 'sg-panel');
    promoteEl.append(el('h2', '', '成りますか？'));
    const row = el('div', 'sg-choices');
    for (const [label, yes] of [['成る（P）', true], ['成らない（N）', false]]) {
      const b = el('button', 'sg-choice', label);
      b.type = 'button';
      b.addEventListener('click', () => pickPromote(yes));
      row.append(b);
    }
    promoteEl.append(row);
    root.append(promoteEl);
  }

  function hidePromote() {
    if (promoteEl) promoteEl.remove();
    promoteEl = null;
    promoteCb = null;
  }

  function pickPromote(yes) {
    const cb = promoteCb;
    hidePromote();
    if (typeof cb === 'function') cb(!!yes);
  }

  function markResult() {
    resultButtons.forEach((b, i) => b.classList.toggle('sel', i === resultSel));
  }

  /** v: { title, tone, lines, choices:[{id,label}] }。選ぶと cb(id) */
  function showResult(v, cb) {
    hideResult();
    if (!root) return;
    resultCb = cb;
    resultChoices = Array.isArray(v.choices) ? v.choices : [];
    resultSel = 0;
    resultButtons = [];
    resultEl = el('div', 'sg-panel');
    resultEl.append(el('h2', v.tone || '', v.title || ''));
    for (const line of v.lines || []) if (line) resultEl.append(el('p', '', line));
    const row = el('div', 'sg-choices');
    resultChoices.forEach((c, i) => {
      const b = el('button', 'sg-choice', c.label);
      b.type = 'button';
      b.addEventListener('mouseenter', () => { resultSel = i; markResult(); });
      b.addEventListener('click', () => pickResult(i));
      row.append(b);
      resultButtons.push(b);
    });
    resultEl.append(row);
    root.append(resultEl);
    root.classList.add('ended');
    markResult();
  }

  function hideResult() {
    if (resultEl) resultEl.remove();
    resultEl = null;
    resultCb = null;
    resultButtons = [];
    if (root) root.classList.remove('ended');
  }

  function pickResult(i) {
    const c = resultChoices[i];
    const cb = resultCb;
    if (!c) return;
    hideResult();
    if (typeof cb === 'function') cb(c.id);
  }

  return {
    mount,
    unmount,
    render,
    showPromote,
    hidePromote,
    pickPromote,
    isPromoteOpen: () => !!promoteEl,
    showResult,
    hideResult,
    isResultOpen: () => !!resultEl,
    moveResult(d) {
      const n = resultChoices.length;
      if (!resultEl || !n) return;
      resultSel = (((resultSel + d) % n) + n) % n;
      markResult();
    },
    confirmResult() {
      if (resultEl) pickResult(resultSel);
    },
    showNasu,
    showOute,
    showFly,
    clearFx,
  };
}

// ---- 駒工房と、対局前の選択（どちらも HTML） ----
const WS_STYLE_ID = 'shogi-ws-style';

function wsCss() {
  const P = PALETTE;
  const sys = 'system-ui,"Hiragino Maru Gothic ProN","Meiryo",sans-serif';
  const mincho = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
  return `
#shogi-ws,#shogi-menu{position:fixed;inset:0;z-index:13;display:flex;align-items:center;justify-content:center;pointer-events:none;font-family:${sys};color:${P.uiText};user-select:none}
#shogi-ws .ws-panel,#shogi-menu .ws-panel{pointer-events:auto;background:${P.uiPanel};border:4px solid ${P.uiBorder};border-radius:16px;padding:14px 22px;box-shadow:0 6px 0 ${P.uiShade};max-width:92vw;max-height:92vh;overflow:auto;text-align:center}
#shogi-ws h2,#shogi-menu h2{margin:0 0 8px;font-size:min(3vw,4.2vh);color:${P.uiGold}}
#shogi-ws p,#shogi-menu p{margin:4px 0;font-weight:700;font-size:min(1.7vw,2.4vh)}
#shogi-ws .ws-body{display:flex;gap:22px;align-items:center;justify-content:center;flex-wrap:wrap}
#shogi-ws .ws-front{font-weight:800;font-size:min(1.4vw,2vh);color:${P.uiDim};margin-bottom:4px}
#shogi-ws .ws-grid{display:grid;grid-template-columns:repeat(7,min(5.2vw,7vh));grid-template-rows:repeat(7,min(5.2vw,7vh));gap:3px}
#shogi-ws .ws-cell{border:2px solid ${P.shogiLine};background:${P.shogiBoard};border-radius:4px;cursor:pointer;padding:0}
#shogi-ws .ws-cell.on{background:${P.uiGood};box-shadow:0 0 8px ${P.uiGood}}
#shogi-ws .ws-cell.cov{background:${P.uiGood};opacity:.4;cursor:default}
#shogi-ws .ws-ray{border:2px dashed ${P.uiDim};background:${P.uiShade};color:${P.uiDim};border-radius:50%;cursor:pointer;font:900 min(2vw,2.8vh) ${sys};padding:0}
#shogi-ws .ws-ray.on{border:2px solid ${P.uiGold};color:${P.uiGold};background:${P.uiAccent}}
#shogi-ws .ws-center{display:flex;align-items:center;justify-content:center;background:${P.shogiBoard};border:2px solid ${P.shogiLine};border-radius:4px}
#shogi-ws .ws-piece{display:flex;align-items:center;justify-content:center;clip-path:polygon(50% 0,86% 15%,100% 100%,0 100%,14% 15%);background:${P.pieceCustom};color:${P.pieceInk};font-family:${mincho};font-weight:900;line-height:1;box-sizing:border-box}
#shogi-ws .ws-center .ws-piece{width:86%;height:92%;padding-top:14%;font-size:min(2.2vw,3vh)}
#shogi-ws .ws-center .ws-piece.two{font-size:min(1.3vw,1.8vh);flex-direction:column}
#shogi-ws .ws-piece .sg-ch{display:block;line-height:1.02}
#shogi-ws .ws-side{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:min(26vw,300px)}
#shogi-ws .ws-big{width:min(10vw,14vh);height:min(11vw,15.5vh);padding-top:2.4vh;font-size:min(6vw,8.5vh)}
#shogi-ws .ws-big.two{font-size:min(3.4vw,4.8vh);flex-direction:column}
#shogi-ws .ws-names{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
#shogi-ws .ws-name{min-width:2.6em;padding:4px 8px;background:${P.uiShade};color:${P.uiText};border:3px solid ${P.uiDim};border-radius:8px;font:900 min(2vw,2.8vh) ${mincho};cursor:pointer}
#shogi-ws .ws-name.sel{border-color:${P.uiGold};background:${P.uiAccent}}
#shogi-ws .ws-input{width:5em;text-align:center;font:900 min(2.2vw,3vh) ${mincho};padding:4px;border-radius:8px;border:3px solid ${P.uiGood}}
#shogi-ws .ws-input.bad{border-color:${P.uiBad}}
#shogi-ws .ws-cost{font:900 min(2.6vw,3.6vh) ${sys}}
#shogi-ws .ws-cost.over{color:${P.uiBad}}
#shogi-ws .ws-msg{min-height:1.4em;color:${P.uiBad};font-size:min(1.4vw,2vh)}
#shogi-ws .ws-btn,#shogi-menu .ws-btn{padding:8px 18px;background:${P.uiShade};color:${P.uiText};border:3px solid ${P.uiBorder};border-radius:10px;font:800 min(1.8vw,2.6vh) ${sys};cursor:pointer}
#shogi-ws .ws-btn:disabled{opacity:.5;cursor:not-allowed;border-color:${P.uiBad};color:${P.uiBad}}
#shogi-ws .ws-btn:not(:disabled):hover,#shogi-menu .ws-btn.sel{background:${P.uiAccent};border-color:${P.uiGold}}
#shogi-menu .ws-choices{display:flex;gap:12px;justify-content:center;margin-top:12px;flex-wrap:wrap}
`;
}

const docOf = (env) => env.doc || (typeof document !== 'undefined' ? document : null);

function mkEl(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function ensureWsStyle(doc) {
  if (doc.getElementById(WS_STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = WS_STYLE_ID;
  s.textContent = wsCss();
  (doc.head || doc.body).append(s);
}

/** 選択のパネル（対局前の「そのまま使う／作り直す」など）。v: {title, lines, choices:[{id,label}]} */
export function createChoicePanel(env = {}) {
  const doc = docOf(env);
  let root = null;
  let cb = null;
  let choices = [];
  let buttons = [];
  let sel = 0;
  const mark = () => buttons.forEach((b, i) => b.classList.toggle('sel', i === sel));
  function hide() {
    if (root) root.remove();
    root = null;
    cb = null;
    choices = [];
    buttons = [];
  }
  function pick(i) {
    const c = choices[i];
    const f = cb;
    if (!c) return;
    hide();
    if (typeof f === 'function') f(c.id);
  }
  function show(v, onPick) {
    hide();
    if (!doc || !doc.body) return;
    ensureWsStyle(doc);
    cb = onPick;
    choices = Array.isArray(v.choices) ? v.choices : [];
    sel = Number.isInteger(v.selected) && v.selected >= 0 && v.selected < choices.length ? v.selected : 0;
    root = mkEl(doc, 'div');
    root.id = 'shogi-menu';
    const panel = mkEl(doc, 'div', 'ws-panel');
    panel.append(mkEl(doc, 'h2', '', v.title || ''));
    for (const line of v.lines || []) if (line) panel.append(mkEl(doc, 'p', '', line));
    const row = mkEl(doc, 'div', 'ws-choices');
    choices.forEach((c, i) => {
      const b = mkEl(doc, 'button', 'ws-btn', c.label);
      b.type = 'button';
      b.addEventListener('mouseenter', () => { sel = i; mark(); });
      b.addEventListener('click', () => pick(i));
      row.append(b);
      buttons.push(b);
    });
    panel.append(row);
    root.append(panel);
    doc.body.append(root);
    mark();
  }
  return {
    show,
    hide,
    isOpen: () => !!root,
    move(d) {
      const n = choices.length;
      if (!root || !n) return;
      sel = (((sel + d) % n) + n) % n;
      mark();
    },
    confirm() {
      if (root) pick(sel);
    },
    choose(i) {
      if (root && Number.isInteger(i) && i >= 0 && i < choices.length) pick(i);
    },
  };
}

/** 駒工房。open(初めの定義, 完成したら cb(def)) */
export function createWorkshop(env = {}) {
  const doc = docOf(env);
  let root = null;
  let def = null;
  let done = null;
  let cellBtns = [];
  let rayBtns = [];
  let nameBtns = [];
  let centerPiece = null;
  let bigPiece = null;
  let input = null;
  let costEl = null;
  let msgEl = null;
  let saveBtn = null;

  const setPieceText = (node, name) => {
    const n = fillPieceText(doc, node, name || '？');
    node.classList.toggle('two', n > 1);
  };

  function refresh() {
    if (!root) return;
    const cov = coveredCells(def.rays);
    const on = new Set(def.cells.map((c) => `${c.dx},${c.dy}`));
    for (const c of cellBtns) {
      const k = `${c.dx},${c.dy}`;
      c.b.classList.toggle('on', on.has(k));
      c.b.classList.toggle('cov', cov.has(k));
    }
    const rs = new Set(def.rays.map((r) => `${r.dx},${r.dy}`));
    for (const r of rayBtns) r.b.classList.toggle('on', rs.has(`${r.dx},${r.dy}`));
    const cost = customCost(def);
    costEl.textContent = `${cost} / ${MAX_CUSTOM_COST} 点`;
    costEl.classList.toggle('over', cost > MAX_CUSTOM_COST);
    input.classList.toggle('bad', !validateCustomName(def.name));
    nameBtns.forEach(({ b, n }) => b.classList.toggle('sel', n === def.name));
    setPieceText(centerPiece, def.name);
    setPieceText(bigPiece, def.name);
    const v = validateCustomDef(def);
    saveBtn.disabled = !v.ok;
    msgEl.textContent = v.ok ? '' : v.errors[0] || '';
  }

  function close() {
    if (root) root.remove();
    root = null;
    done = null;
    cellBtns = [];
    rayBtns = [];
    nameBtns = [];
  }

  function open(initial, cb) {
    close();
    if (!doc || !doc.body) return;
    ensureWsStyle(doc);
    def = normalizeCustomDef(initial && typeof initial === 'object' ? initial : {
      name: DEFAULT_NAMES[0], cells: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }], rays: [],
    });
    if (!def.name) def = { ...def, name: DEFAULT_NAMES[0] };
    done = cb;
    root = mkEl(doc, 'div');
    root.id = 'shogi-ws';
    const panel = mkEl(doc, 'div', 'ws-panel');
    panel.append(mkEl(doc, 'h2', '', '駒工房 ― オリジナルの駒を作ろう'));
    panel.append(mkEl(doc, 'p', '', 'マス: 1点（跳んで行ける）／ ∞: 3点（どこまでも進める・駒で止まる）／ 成らない駒'));
    const body = mkEl(doc, 'div', 'ws-body');
    const left = mkEl(doc, 'div');
    left.append(mkEl(doc, 'div', 'ws-front', '↑ 前（おなすくんの陣）'));
    const grid = mkEl(doc, 'div', 'ws-grid');
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 7; gx++) {
        const dx = gx - 3;
        const dy = gy - 3;
        if (!dx && !dy) {
          const c = mkEl(doc, 'div', 'ws-center');
          centerPiece = mkEl(doc, 'div', 'ws-piece');
          c.append(centerPiece);
          grid.append(c);
        } else if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) {
          const b = mkEl(doc, 'button', 'ws-cell');
          b.type = 'button';
          b.addEventListener('click', () => {
            def = toggleCell(def, dx, dy);
            refresh();
          });
          cellBtns.push({ b, dx, dy });
          grid.append(b);
        } else if (dx % 3 === 0 && dy % 3 === 0) {
          const rdx = dx / 3 || 0;
          const rdy = dy / 3 || 0;
          const b = mkEl(doc, 'button', 'ws-ray', '∞');
          b.type = 'button';
          b.addEventListener('click', () => {
            def = toggleRay(def, rdx, rdy);
            refresh();
          });
          rayBtns.push({ b, dx: rdx, dy: rdy });
          grid.append(b);
        } else {
          grid.append(mkEl(doc, 'div'));
        }
      }
    }
    left.append(grid);
    const side = mkEl(doc, 'div', 'ws-side');
    bigPiece = mkEl(doc, 'div', 'ws-piece ws-big');
    side.append(bigPiece, mkEl(doc, 'p', '', '名前（漢字1〜2文字）'));
    const names = mkEl(doc, 'div', 'ws-names');
    for (const n of DEFAULT_NAMES) {
      const b = mkEl(doc, 'button', 'ws-name', n);
      b.type = 'button';
      b.addEventListener('click', () => {
        def = { ...def, name: n };
        input.value = n;
        refresh();
      });
      nameBtns.push({ b, n });
      names.append(b);
    }
    input = mkEl(doc, 'input', 'ws-input');
    input.type = 'text';
    input.maxLength = 4;
    input.value = def.name;
    input.placeholder = '自由入力';
    input.addEventListener('input', () => {
      def = { ...def, name: input.value.trim() };
      refresh();
    });
    costEl = mkEl(doc, 'div', 'ws-cost');
    msgEl = mkEl(doc, 'div', 'ws-msg');
    saveBtn = mkEl(doc, 'button', 'ws-btn', 'この駒で対局する');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => {
      if (!validateCustomDef(def).ok) return;
      const d = normalizeCustomDef(def);
      const f = done;
      close();
      if (typeof f === 'function') f(d);
    });
    side.append(names, input, costEl, msgEl, saveBtn);
    body.append(left, side);
    panel.append(body);
    root.append(panel);
    doc.body.append(root);
    refresh();
  }

  return {
    open, close, isOpen: () => !!root, current: () => def,
  };
}
