// 画面。ルールは rules.js、絵は art.js、演出は fx.js、音は sfx.js。ここは並べて、クリックをルールへ渡すだけ。
import * as R from "./rules.js";
import * as FX from "./fx.js";
import { SFX, unlock, toggleMute, isMuted } from "./sfx.js";
import { painter, background, rasterPeople, drawPerson, ROT, AGE, PAL } from "./art.js";
import { Music } from "./music.js";
import { PEOPLE } from "../data/people.js";
import { T } from "../data/text.js";
import { VERSION, DATE } from "../version.js";
import * as SV from "./save.js";

const cv = document.getElementById("c");
const P = painter(cv.getContext("2d"));
const { box, spr } = P;
const txt = document.getElementById("txt");
const q = new URLSearchParams(location.search);

const S = { mode: "title", run: null, b: null, msg: T.turnStart, hover: -1, choices: [], owner: {}, lock: false };
// 保存（無くても遊べる。src/save.js）。難しさは開いている一番上の段から
S.save = SV.load();
S.asc = SV.ascOpen(S.save);

// ---- 文字（DOM で点の上に重ねる。座標は点の単位） ----
let texts = [];
function W(a, b, s, cls = "") { texts.push(`<div class="t ${cls}" style="left:${a * 4}px;top:${b * 4}px">${s}</div>`); }

// ---- 当たり判定（点の単位の四角） ----
let hits = [];
function hit(a, b, w, h, fn, hover) { hits.push({ a, b, w, h, fn, hover }); }

// ---- 場所（演出の出どころ。点の単位） ----
const HERO = [51, 34], FOE = [270, 34], ENERGY = [20, 110];
const slot = i => [40 + i * 41, 112];

// ---- 札 ----
const CW = 38, CH = 62;
function intentText(m, str) {
  const s = [];
  if (m.atk) s.push(`攻${R.enemyHit(m, str)}${m.times ? "×" + m.times : ""}`);
  if (m.def) s.push(`守${m.def}`);
  if (m.mold) s.push(`手札 熟成+${m.mold}`);
  if (m.steal) s.push("札を奪う");
  if (m.str) s.push(`力+${m.str}`);
  if (m.eat) s.push("札を食べる");
  if (m.chill) s.push(`手札 熟成-${m.chill}`);
  if (m.pickle) s.push("札を腐らせる");
  return s.join(" ");
}
// 札の短い説明。動きの種類ごとに1つ（新しい動きを足したらここにも足す）
const EFF = {
  atk: (o, n) => `攻${n(o.atk)}${o.times > 1 ? "×" + o.times : ""}`,
  def: (o, n) => `守${n(o.def)}`, poison: (o, n) => `毒${n(o.poison)}`, heal: (o, n) => `回${n(o.heal)}`,
  ageOthers: o => `他+${o.ageOthers}段`, freeze: () => "漬け止め", salt: o => `塩-${o.salt}段`,
  atkPerRotten: o => `腐×攻${o.atkPerRotten}`, defPerRotten: o => `腐×守${o.defPerRotten}`,
  poisonPerRotten: o => `腐×毒${o.poisonPerRotten}`, healPerRotten: o => `腐×回${o.healPerRotten}`,
  draw: o => `${o.draw}枚引く`, weaken: o => `力-${o.weaken}`, energy: o => `気力+${o.energy}`,
  atkPerAge: o => `段×攻${o.atkPerAge}`, rotOldest: () => "腐らせる", fresh: () => "漬け直し",
  atkPerBlock: o => `守×攻${o.atkPerBlock}`, atkPerPoison: o => `毒×攻${o.atkPerPoison}`,
  atkPerPlayed: o => `連×攻${o.atkPerPlayed}`, brine: o => `敵漬+${o.brine}`,
};
function effText(c) {
  const d = R.CARD[c.id], ops = c.rotten ? d.rotPlay : d.play;
  if (!ops || !ops.length) return "使えない";
  const v = R.value(c), n = x => (x === "v" ? v : x);
  return ops.map(o => Object.keys(o).filter(k => EFF[k]).map(k => EFF[k](o, n)).join(" ")).join(" ");
}
// 漬かり具合（0〜2）。腐る札は腐る段までの割合、腐らない札は育つ上限までの割合
function ageStage(c) {
  const r = R.rotOf(c), x = r == null ? Math.min(c.age, R.GROW_MAX) / R.GROW_MAX : c.age / r;
  return x >= 0.66 ? 2 : x >= 0.33 ? 1 : 0;
}
function drawCard(c, a, b, { lift = false, dim = false, danger = false } = {}) {
  const d = R.CARD[c.id];
  if (lift) b -= 5;
  if (lift || danger) P.R(a - 2, b - 2, CW + 4, CH + 4, "r");
  if (danger) P.R(a - 3, b - 3, CW + 6, CH + 6, "r");
  box(a, b, CW, CH, c.rotten ? "o" : d.up ? "y" : "w");
  box(a + 2, b + 3, 34, 34, c.rotten ? "m" : "s");
  spr(d.sprite, a + 3, b + 4, 2, c.rotten ? ROT : AGE[ageStage(c)]);
  box(a - 3, b - 3, 9, 9, "r");
  W(a - 1.5, b - 2.5, String(d.cost), "w");
  W(a + 2, b + 38.5, d.name.slice(0, 5));
  if (d.up) { box(a + 29, b + 37, 9, 9, "r"); W(a + 30, b + 37.5, "＋", "w s12"); }   // 強化した札
  W(a + 2, b + 45, effText(c), "r s12");
  // 熟成の目盛り：漬かった段は緑・今の段は黄・腐る段は赤。右上に「あとN」（腐らない札は∞）
  const left = R.turnsLeft(c);
  if (d.rot != null && !c.rotten) {
    const rt = R.rotOf(c), n = rt + 1, w = Math.floor(34 / n);
    for (let i = 0; i < n; i++) {
      const px = a + 2 + i * w;
      P.R(px, b + 54, w - 1, 6, "k");
      P.R(px + 1, b + 55, w - 3, 4, i === rt ? "r" : i < c.age ? "g" : i === c.age ? "Y" : "w");
    }
    const col = left <= 1 ? "r" : left === 2 ? "Y" : "g";
    box(a + 15, b - 4, 22, 10, col, "k");
    W(a + 16.5, b - 2.5, `${T.left}${left}`, left === 2 ? "" : "w");
  } else if (!c.rotten) {
    W(a + 2, b + 54, "腐らない", "s12");
    box(a + 23, b - 4, 14, 10, "b", "k"); W(a + 26, b - 3.5, "∞", "w");
  }
  if (c.rotten) { box(a + 23, b - 4, 14, 10, "N", "k"); W(a + 26, b - 2.5, T.rotten, "w"); }
  if (dim) for (let j = 0; j < CH; j += 2) for (let i = (j / 2) % 2; i < CW; i += 2) P.R(a + i, b + j, 1, 1, "k");
}

// ---- 画面ごとの描画 ----
function render() {
  texts = []; hits = [];
  P.R(0, 0, 320, 180, "k");
  if (S.mode === "title") title();
  else if (S.mode === "pick") pick();
  else if (S.mode === "battle") battle();
  else if (S.mode === "reward") reward();
  else if (S.mode === "deck") deckView();
  else if (S.mode === "map") mapView();
  else if (S.mode === "rest") restView();
  else if (S.mode === "shop") shopView();
  else if (S.mode === "event") eventView();
  else if (S.mode === "book") bookView();
  else if (S.mode === "ach") achView();
  else end();
  if (S.mode === "battle" && S.intro) bossIntro();
  // 曲：戦い（親分は別の曲）・それ以外の画面。終わりの画面は止める
  Music.play(S.mode === "battle" ? (S.b.kind === "boss" ? "boss" : "battle") : S.mode === "end" ? null : "calm");
  FX.drawUnder(P, (c, a, b) => drawCard(c, a, b));
  FX.drawOver(P, W);
  txt.innerHTML = texts.join("");
  const [dx, dy] = FX.shakeOffset();
  cv.style.transform = txt.style.transform = dx || dy ? `translate(${dx * 4}px,${dy * 4}px)` : "";
}
FX.onFrame(render);

function muteButton(a, b) {
  box(a, b, 24, 10, isMuted() ? "k" : "b", "w");
  W(a + 3, b + 2, isMuted() ? T.soundOff : T.soundOn, "w s12");
  hit(a, b, 24, 10, () => { toggleMute(); SFX.click(); });
}

function title() {
  background(P, "第一章");
  drawPerson(P, S.owner.hero, 40, 34);
  box(100, 22, 190, 34, "w");
  W(108, 26, T.title, "big");
  T.howto.forEach((s, i) => W(104, 62 + i * 6, s, "s12 w sh"));
  // はじめる・今日の挑戦・図鑑・実績
  const today = SV.daily(), done = S.save.daily[today.key];
  [
    { label: T.start, fn: () => { SFX.reward(); go("pick"); } },
    { label: T.dailyGo, fn: () => { SFX.reward(); startDaily(); } },
    { label: T.bookGo, fn: () => { SFX.click(); S.bookTab = S.bookTab || "cards"; go("book"); } },
    { label: T.achGo, fn: () => { SFX.click(); go("ach"); } },
  ].forEach((o, k) => {
    const a = 100 + k * 50, on = S.hover === `t${k}`;
    box(a, 140, 46, 16, k ? (on ? "y" : "w") : "r", on ? "r" : "k");
    W(a + 4, 143, o.label, k ? (on ? "r" : "") : "w");
    hit(a, 140, 46, 16, o.fn, `t${k}`);
  });
  W(100, 160, done ? T.dailyDone(R.DECK[done.deck]?.name || "", done.won) : T.dailyHint(R.DECK[today.deck].name, today.asc), "s12 w sh");
  W(3, 170, `Ver ${VERSION}（${DATE}）`, "s12 w sh");
  muteButton(292, 168);
}

// 型を選ぶ（data/decks.js）。4つ並べ、選んだ型の山札で挑戦を始める
function pick() {
  background(P, "第一章");
  box(96, 6, 128, 16); W(104, 9.5, T.pick, "");
  box(6, 6, 40, 14, "w"); W(12, 8.5, T.back, "s12");
  hit(6, 6, 40, 14, () => { SFX.click(); go("title"); });
  // 左に型の名前を並べ、右に選んでいる型（指している型）の中身を見せる
  const lk = SV.locked(S.save).decks;
  const sel = typeof S.hover === "number" && S.hover >= 0 && S.hover < R.DECKS.length ? S.hover : S.sel || 0;
  R.DECKS.forEach((d, i) => {
    const b = 24 + i * 18, on = i === sel, hidden = lk.includes(d.id);
    box(6, b, 98, 17, on ? "y" : "w", on ? "r" : "k");
    if (hidden) { W(26, b + 3.5, T.lockedName, "fade"); hit(6, b, 98, 17, () => { SFX.click(); }, i); return; }
    spr(d.sprite, 8, b + 0.5, 1);
    W(26, b + 3.5, d.name, on ? "r" : "");
    if (S.save.clearDecks[d.id] != null) W(88, b + 4.5, "★", "s12 Y");
    hit(6, b, 98, 17, () => { S.sel = i; SFX.click(); }, i);
  });
  const d = R.DECKS[sel];
  if (lk.includes(d.id)) {
    box(110, 26, 204, 144, "w");
    W(116, 34, T.lockedName, "big");
    W(116, 60, T.lockedHow(SV.unlockOf(d.id)?.text || ""), "");
    muteButton(292, 2);
    W(6, 172, `Ver ${VERSION}`, "s12 w sh");
    return;
  }
  box(110, 26, 204, 144, "w");
  box(116, 32, 50, 50, "s");
  spr(d.sprite, 117, 33, 3);
  W(172, 34, d.name, "big");
  d.how.forEach((s, k) => W(172, 52 + k * 7, s, "s12"));
  const kinds = [...new Set(d.deck)].filter(id => id !== "nasu" && id !== "nuka");
  W(116, 88, T.pickDeck, "s12 r");
  kinds.forEach((id, k) => { spr(R.CARD[id].sprite, 116 + k * 40, 95, 2); W(116 + k * 40, 128, R.CARD[id].name.slice(0, 5), "s12"); });
  // 難しさ（クリアした段の次まで選べる）
  const open = SV.ascOpen(S.save);
  S.asc = Math.max(0, Math.min(open, S.asc));
  const arrow = (a, dir, ok) => { box(a, 150, 12, 16, ok ? "b" : "k", "w"); W(a + 3, 153, dir < 0 ? "◀" : "▶", ok ? "w" : "w fade"); if (ok) hit(a, 150, 12, 16, () => { SFX.click(); S.asc += dir; }); };
  arrow(116, -1, S.asc > 0);
  box(130, 150, 52, 16, S.asc ? "Y" : "w"); W(134, 153, T.ascName(S.asc), "");
  arrow(184, 1, S.asc < open);
  W(116, 139, S.asc ? T.ascRule(R.ASCENSION[S.asc - 1]) : T.ascNone(open), "s12");
  box(236, 150, 72, 16, "r"); W(244, 153, T.pickGo, "w");
  hit(236, 150, 72, 16, () => startRun(d.id));
  muteButton(292, 2);
  W(6, 172, `Ver ${VERSION}`, "s12 w sh");
}
function startRun(type) {
  if (SV.locked(S.save).decks.includes(type)) return;
  SFX.reward();
  // ?ch=1 で第二章から（確かめ用）。最初は地図を見せて、段0の戦いへ。まだ解放していない札・道具は出ない
  const lk = SV.locked(S.save);
  S.run = R.newRun(Number(q.get("seed")) || Date.now() % 100000, type, Math.min(R.CHAPTERS.length - 1, Number(q.get("ch")) || 0), { asc: S.asc, locked: [...lk.cards, ...lk.relics] });
  S.endInfo = null;
  go("map");
}
// 今日の挑戦：日付から種と型が決まる（誰でも同じ日は同じ挑戦）。難しさ2・全部解放
function startDaily() {
  const d = SV.daily();
  S.run = R.newRun(d.seed, d.deck, 0, { asc: d.asc, daily: true });
  S.run.dailyKey = d.key;
  S.endInfo = null;
  go("map");
}

function startBattle() {
  S.b = R.startBattle(S.run); S.mode = "battle"; S.msg = T.turnStart; S.lock = false; FX.resetTrail();
  // 親分は名札と台詞で登場（タップで飛ばせる。約2.6秒で消える）
  const d = R.ENEMY[S.b.enemy.id];
  S.intro = S.b.kind === "boss" && d.intro ? { t: performance.now() } : null;
  if (S.intro) { SFX.boss(); FX.shake(3, 250); }
}
const INTRO_MS = 2600;
function bossIntro() {
  const e = S.b.enemy, d = R.ENEMY[e.id], k = (performance.now() - S.intro.t) / INTRO_MS;
  if (k >= 1) { S.intro = null; return; }
  // 帯が左から伸び、名札・名前・台詞の順に出る
  const w = Math.min(320, Math.round(320 * Math.min(1, k * 5)));
  // 帯の下になる戦いの文字（体力の数字など）は隠す。文字は点の上に重ねた DOM なので、絵だけ塗っても透ける
  texts = texts.filter(t => { const y = Number(/top:([\d.]+)px/.exec(t)?.[1]) / 4; return y < 58 || y > 114; });
  P.R(0, 62, w, 52, "k"); P.R(0, 64, w, 1, "r"); P.R(0, 111, w, 1, "r");
  if (k > 0.15) { box(20, 70, 58, 11, "r", "w"); W(23, 72, d.intro.title, "w s12"); }
  if (k > 0.25) W(20, 84, e.name, "w big");
  if (k > 0.4) W(120, 88, `「${d.intro.line}」`, "w");
  hit(0, 0, 320, 180, () => { S.intro = null; });
}

// 敵の絵を一色で塗る（点滅用）
const solid = c => Object.fromEntries(Object.keys(PAL).map(k => [k, c]));

function battle() {
  const b = S.b, e = b.enemy, p = b.player;
  background(P, b.chapter);
  P.R(0, 0, 320, 12, "b"); P.R(0, 12, 320, 1, "k");
  W(3, 2, T.title, "w"); W(70, 2, T.fight(b.chapter, b.layer, b.layers, b.kind) + (b.run.daily ? ` ${T.dailyTag}` : "") + (b.run.asc ? ` ${T.ascName(b.run.asc)}` : ""), "w"); W(268, 2, T.pile(b.draw.length, b.discard.length), "w");
  muteButton(240, 1);
  W(204, 3.5, `Ver ${VERSION}`, "w s12");
  // 自分
  drawPerson(P, S.owner.hero, 34, 17, false, FX.blinkColor("hero") || "k");
  bar(18, 66, "タクアリヌス", p.hp, p.maxHp, p.block ? `守${p.block}` : "", "hero");
  // 敵
  const bl = FX.blinkColor("foe");
  const ed = R.ENEMY[e.id];
  if (ed.person) drawPerson(P, S.owner[ed.person], 296 - PEOPLE[ed.person].w, 17, ed.person === "foe", bl || ed.ink || "k");
  else spr(e.sprite, 250, 16, 3, bl ? solid(bl) : {});
  bar(232, 66, e.name, e.hp, e.maxHp, [e.block ? `守${e.block}` : "", e.poison ? `毒${e.poison}` : "", e.brine ? `漬${e.brine}` : "", R.ENEMY[e.id].split && !e.split ? T.splitTag : "", e.str ? `力${e.str > 0 ? "+" : ""}${e.str}` : ""].filter(Boolean).join(" "), "foe");
  box(158, 50, 76, 10); W(160, 51.5, "次: " + intentText(R.intent(b), e.str), "r");
  box(158, 60, 72, 8, "y"); W(160, 60.8, "その次: " + intentText(R.intentAt(b, 1), e.str), "s12");
  // 伝言
  box(96, 16, 128, 26);
  // 「寝かせて終了」を指しているときは、この番を終えると腐る札を知らせる
  const doomed = b.hand.filter(c => R.rotsAtEnd(b, c));
  const onEnd = S.hover === "end";
  const m = onEnd ? (doomed.length ? `${T.endRots}\n${doomed.map(c => R.CARD[c.id].name).join("・")}` : T.endSafe)
    : S.hover >= 0 && b.hand[S.hover] ? hoverText(b.hand[S.hover]) : sideHint() || S.msg;
  m.split("\n").slice(0, 3).forEach((s, i) => W(99, 18 + i * 7.5, s, onEnd && doomed.length && i === 0 ? "r" : ""));
  // 手札（腐る札は赤く点滅。終了を指すと揺れる）
  const blinkOn = Math.floor(performance.now() / 280) % 2 === 0;
  b.hand.forEach((c, i) => {
    const [a] = slot(i), ok = !S.lock && (R.canPlay(b, i) || R.canCompost(b, i)), danger = doomed.includes(c);
    const dx = danger && onEnd ? (Math.floor(performance.now() / 60) % 2 ? 1 : -1) : 0;
    drawCard(c, a + dx, 112, { lift: i === S.hover && ok, dim: !ok, danger: danger && (blinkOn || onEnd) });
    hit(a, 107, CW, CH + 5, () => act(i), i);
  });
  // 気力と終了
  box(4, 114, 32, 32, "r"); W(12, 117, String(p.energy), "w big"); W(7, 137, `/3${T.energy}`, "w s12");
  box(285, 146, 32, 28, onEnd && doomed.length ? "r" : "b"); W(288, 149, T.endTurn[0], "w s12"); W(288, 158, T.endTurn[1], "w");
  hit(285, 146, 32, 28, endTurn, "end");
  // 樽の道具（指すと説明）・土地と縛り・漬け汁（タップで使う）
  relicStrip(2, 91, 13);
  const land = R.CHAPTERS[S.run.ch].land, vow = b.vow && R.VOW[b.vow];
  if (land || vow) {
    const s = [land && land.name, vow && `${T.vowTag} ${vow.name}`].filter(Boolean).join("・");
    box(232, 91, Math.min(86, s.length * 4 + 6), 10, vow ? "r" : "m", "k"); W(235, 92.5, s, "w s12");
    hit(232, 91, 86, 10, () => { S.hover = "land"; }, "land");
  }
  potionSlots(3, 149, true);
}
// 樽の道具を横に並べる（指す・長押しで説明）
function relicStrip(a, b, max) {
  const rs = S.run.relics;
  if (rs.length) box(a - 2, b - 2, Math.min(rs.length, max) * 17 + 3, 20, "b", "k");   // 背景の樽と紛れないように下地
  rs.slice(0, max).forEach((id, i) => {
    const x = a + i * 17, on = S.hover === `r${i}`;
    if (on) P.R(x - 1, b - 1, 18, 18, "r");
    spr(R.RELIC[id].sprite, x, b, 1);
    hit(x, b, 16, 16, () => { S.hover = `r${i}`; }, `r${i}`);   // タップでも説明
  });
  if (rs.length > max) W(a + max * 17, b + 4, `+${rs.length - max}`, "w s12 sh");
}
// 漬け汁の入れ物（持てる数だけ枠）。戦いの中ならタップで使う
function potionSlots(a, b, usable) {
  const n = R.potionMax(S.run);
  for (let k = 0; k < n; k++) {
    const x = a + (k % 2) * 17, y = b + Math.floor(k / 2) * 15, id = S.run.potions[k], on = S.hover === `p${k}`;
    box(x, y, 16, 14, on ? "y" : id ? "w" : "k", on ? "r" : "w");
    if (id) {
      P.ctx.save(); P.ctx.beginPath(); P.ctx.rect(x + 1, y + 1, 14, 12); P.ctx.clip();
      spr(R.POTION[id].sprite, x, y - 1, 1); P.ctx.restore();
      hit(x, y, 16, 14, () => (usable ? usePotion(k) : null), `p${k}`);
    }
  }
}
function usePotion(k) {
  const b = S.b;
  if (S.lock || b.over) return;
  const n = b.log.length, before = snap(b);
  if (!R.usePotion(b, k)) return;
  SFX.reward();
  S.msg = summarize(b.log.slice(n)) || T.turnStart;
  afterAction(react(b, before, b.log.slice(n), 120));
}
// 指しているもの（道具・漬け汁・土地）の説明。無ければ null
function sideHint() {
  const h = S.hover;
  if (typeof h !== "string") return null;
  if (h[0] === "r" && S.run.relics[+h.slice(1)]) { const x = R.RELIC[S.run.relics[+h.slice(1)]]; return `${T.relicHead}「${x.name}」\n${x.text}`; }
  if (h[0] === "p" && S.run.potions[+h.slice(1)]) { const x = R.POTION[S.run.potions[+h.slice(1)]]; return `${T.potionHead}「${x.name}」\n${x.text}${S.mode === "battle" ? "\n" + T.potionUse : ""}`; }
  if (h === "land") {
    const land = R.CHAPTERS[S.run.ch].land, vow = S.b?.vow && R.VOW[S.b.vow];
    return [land && `${T.landHead}「${land.name}」${land.text}`, vow && T.vowHint(vow)].filter(Boolean).join("\n");
  }
  return null;
}
function bar(a, b, name, hp, max, extra, key) {
  box(a, b, 70, 8); W(a + 3, b + 0.5, name);
  box(a, b + 9, 70, 6);
  const shown = FX.trail(`${S.run.ch}-${S.b.layer}-${key}`, hp), wv = v => Math.max(0, Math.round(68 * v / max));
  P.R(a + 1, b + 10, wv(shown), 4, "Y");                     // 減った分の跡
  P.R(a + 1, b + 10, wv(hp), 4, "g");
  W(a + 24, b + 9.5, `${hp}/${max}`); if (extra) { box(a, b + 16, extra.length * 4 + 4, 7, "b"); W(a + 2, b + 16.5, extra, "w s12"); }
}
function hoverText(c) {
  const d = R.CARD[c.id];
  if (c.rotten && !d.rotPlay) return `${d.name}：${T.compostHint}`;
  const rt = R.rotOf(c), next = rt == null || c.age + 1 < rt ? R.value({ ...c, age: c.age + 1 }) : null;
  const head = `${d.name}（${c.rotten ? "腐" : c.age + "段"}） ${effText(c)}`;
  const tail = c.rotten ? "腐ってからが本番の札" : next != null && d.base + d.grow ? `寝かせると 次 ${next}` : d.rot != null ? "次で腐る" : "";
  const cb = R.COMBOS.find(x => x.cards.includes(R.baseId(c.id)));
  return `${head}\n${d.text}\n${tail}${cb ? `${tail ? " " : ""}${T.comboOf(cb.name)}（${cb.text}）` : ""}`;
}

// ---- 手応え：動く前と後を比べ、記録（log）を順に見せる ----
function snap(b) {
  return { eh: b.enemy.hp, ep: b.enemy.poison, es: b.enemy.str, ph: b.player.hp, pb: b.player.block, en: b.player.energy,
    ages: new Map(b.hand.map(c => [c.uid, c.age])) };
}
const later = (ms, fn) => setTimeout(fn, ms);
const jit = k => ((k * 37) % 13) - 6;
function cardAt(b, uid) { const i = b.hand.findIndex(c => c.uid === uid); return i < 0 ? null : slot(i); }

function react(b, before, log, t = 0) {
  let k = 0;
  // 手札が漬かった（自分の番の終わり・糠床・カビ）
  let aged = 0;
  for (const c of b.hand) {
    const was = before.ages.get(c.uid);
    if (was == null || c.rotten || c.age <= was) continue;
    const [a, y] = slot(b.hand.indexOf(c));
    FX.float(a + 10, y - 4, `+${c.age - was}段`, "Y s12", t);
    FX.flash(a + 2, y + 55, 34, 4, "Y", t);
    aged++;
  }
  if (aged) later(t, SFX.age);
  for (const l of log) {
    const d = t + k * 140;
    if (l.t === "hit" && l.who === "enemy") {
      k++;
      if (l.n > 0) {
        FX.float(FOE[0] + jit(k), FOE[1] + jit(k + 3) / 2, `-${l.n}`, l.n >= 12 ? "r big" : "r", d);
        FX.blink("foe", "w", d); FX.shake(Math.min(6, 1 + l.n / 4), d);
        if (l.n >= 12) FX.burst(FOE[0], FOE[1], ["w", "Y", "r"], 14, d);
        later(d, () => SFX.hit(l.n));
      } else { FX.float(FOE[0] - 12, FOE[1], T.blocked, "l s12", d); later(d, SFX.blocked); }
    }
    if (l.t === "hit" && l.who === "player") {
      k++;
      if (l.n > 0) {
        FX.float(HERO[0] + jit(k), HERO[1], `-${l.n}`, "r", d);
        FX.blink("hero", "r", d); FX.shake(Math.min(7, 2 + l.n / 3), d);
        for (const [x, y, w, h] of [[0, 0, 320, 2], [0, 178, 320, 2], [0, 0, 2, 180], [318, 0, 2, 180]]) FX.flash(x, y, w, h, "r", d);
        later(d, SFX.hurt);
      } else { FX.float(HERO[0] - 10, HERO[1], T.guarded, "l s12", d); later(d, SFX.blocked); }
    }
    if (l.t === "poison") { k++; FX.float(FOE[0], FOE[1] - 6, `${T.poison}-${l.n}`, "pp", d); FX.blink("foe", "p", d); later(d, SFX.poison); }
    if (l.t === "rot") {
      const at = cardAt(b, l.uid);
      if (at) { FX.flash(at[0], at[1], CW, CH, "m", d, 300); FX.float(at[0] + 6, at[1] + 14, T.rotNow, "m pop2", d); FX.burst(at[0] + 19, at[1] + 20, ["m", "N", "g"], 8, d); }
      later(d, SFX.rot);
    }
    if (l.t === "fresh") { const at = cardAt(b, l.uid); if (at) { FX.flash(at[0], at[1], CW, CH, "s", d); FX.float(at[0] + 2, at[1] + 14, T.freshNow, "l s12", d); } later(d, SFX.fresh); }
    if (l.t === "mold") { k++; FX.float(150, 100, `${T.mold}+${l.n}段`, "m", d); FX.shake(1.5, d); later(d, SFX.mold); }
    if (l.t === "steal") { k++; FX.float(140, 100, `${R.CARD[l.id].name}${T.stolen}`, "r s12", d); later(d, SFX.steal); }
    if (l.t === "eat") { k++; FX.float(140, 100, `${R.CARD[l.id].name}${T.eaten}`, "r s12", d); FX.shake(2, d); later(d, SFX.steal); }
    if (l.t === "chill") { k++; FX.float(140, 100, `${T.chill}-${l.n}段`, "l", d); FX.flash(40, 107, 246, 4, "s", d, 300); later(d, SFX.fresh); }
    if (l.t === "rage") { k++; FX.float(FOE[0], FOE[1] + 20, T.rage(l.n), "r", d); FX.shake(1, d); later(d, SFX.mold); }
    if (l.t === "pickle") { k++; FX.float(140, 96, `${R.CARD[l.id].name}${T.pickled}`, "w s12", d); later(d, SFX.mold); }
    if (l.t === "phase") { k++; FX.float(FOE[0] - 30, FOE[1] + 6, T.phase, "r big", d, 1300); FX.blink("foe", "r", d, 600); FX.shake(4, d); FX.burst(FOE[0], FOE[1], ["r", "Y", "k"], 18, d); later(d, SFX.boss); }
    if (l.t === "combo") { k++; FX.float(110, 44, T.combo(R.COMBOS.find(x => x.id === l.id).name), "Y big", d, 1100); FX.burst(160, 60, ["Y", "w", "r"], 16, d); FX.shake(2, d); later(d, SFX.ferment); }
    if (l.t === "potion") { k++; FX.float(HERO[0] - 10, HERO[1] - 14, R.POTION[l.id].name, "l", d); FX.burst(HERO[0], HERO[1], ["l", "w"], 10, d); }
    if (l.t === "land") { k++; FX.float(150, 100, `${T.mold}+${l.n}段`, "m", d); later(d, SFX.mold); }
    if (l.t === "sea") { k++; FX.float(140, 100, "潮風 -1段", "l s12", d); later(d, SFX.fresh); }
    if (l.t === "split") { k++; FX.float(FOE[0] - 12, FOE[1] - 12, T.split, "Y big", d, 1100); FX.burst(FOE[0], FOE[1], ["Y", "y", "o"], 16, d); FX.shake(3, d); later(d, SFX.ferment); }
  }
  const p = b.player, e = b.enemy, d = t + k * 140;
  if (p.block > before.pb) { FX.float(HERO[0] - 6, HERO[1] + 10, `守+${p.block - before.pb}`, "l", t); later(t, SFX.guard); }
  if (p.hp > before.ph) { FX.float(HERO[0] - 4, HERO[1] - 8, `+${p.hp - before.ph}`, "gr", t); FX.burst(HERO[0], HERO[1], ["g", "w"], 8, t); later(t, SFX.heal); }
  if (e.poison > before.ep) { FX.float(FOE[0] - 8, FOE[1] + 10, `${T.poison}+${e.poison - before.ep}`, "pp", d); later(d, SFX.poison); }
  if (e.str < before.es) FX.float(FOE[0] - 8, FOE[1] - 10, `力${e.str - before.es}`, "l s12", d);
  if (p.energy > before.en) FX.float(ENERGY[0], ENERGY[1], `${T.energy}+${p.energy - before.en}`, "Y s12", t);
  return d;
}

function act(i) {
  const b = S.b;
  if (S.lock) return;
  const c = b.hand[i], n = b.log.length, before = snap(b), [a, y] = slot(i);
  if (R.canPlay(b, i)) R.play(b, i);
  else if (R.canCompost(b, i)) R.compost(b, i);
  else { SFX.click(); return; }
  const log = b.log.slice(n), ferment = log[0].t === "play" && log[0].rotten;
  if (log[0].t === "compost") { FX.burst(a + 19, y + 20, ["N", "n", "m"], 12); later(0, SFX.compost); }
  else {
    FX.ghost(c, a, y, 141, 52); SFX.card();
    if (ferment) {
      FX.float(128, 44, T.ferment, "Y big", 120, 1100); FX.burst(160, 60, ["m", "Y", "g", "w"], 18, 120); FX.shake(2, 120);
      later(120, SFX.ferment);
    }
  }
  S.msg = summarize(log) || T.turnStart;
  S.hover = -1;
  const done = react(b, before, log, ferment ? 420 : 200);
  afterAction(done);
}
function endTurn() {
  const b = S.b;
  if (S.lock || b.over) return;
  const n = b.log.length, before = snap(b);
  R.endTurn(b);
  S.msg = summarize(b.log.slice(n)) || T.turnStart;
  const done = react(b, before, b.log.slice(n), 0);
  if (!b.over) later(done + 120, SFX.turn);
  afterAction(done);
}
function summarize(log) {
  const s = [];
  for (const l of log) {
    if (l.t === "hit" && l.who === "enemy") s.push(`${l.n}のダメージ`);
    if (l.t === "hit" && l.who === "player") s.push(`${l.n}くらった`);
    if (l.t === "rot") s.push(`${R.CARD[findId(l.uid)]?.name || "札"}が腐った`);
    if (l.t === "fresh") s.push(`${R.CARD[findId(l.uid)]?.name || "札"}を漬け直した`);
    if (l.t === "mold") s.push(`手札が${l.n}段漬かった`);
    if (l.t === "steal") s.push(`${R.CARD[l.id].name}を奪われた`);
    if (l.t === "eat") s.push(`${R.CARD[l.id].name}を食べられた`);
    if (l.t === "chill") s.push(`霜で手札が${l.n}段戻った`);
    if (l.t === "rage") s.push(T.rageMsg(l.n));
    if (l.t === "pickle") s.push(`${R.CARD[l.id].name}に塩をすり込まれた`);
    if (l.t === "split") s.push("分裂して起き上がった！");
    if (l.t === "poison") s.push(`毒で${l.n}`);
    if (l.t === "compost") s.push(`${R.CARD[l.id].name}を堆肥に`);
    if (l.t === "phase") s.push(`「${R.ENEMY[l.id].phase.line}」`);
    if (l.t === "combo") s.push(T.combo(R.COMBOS.find(x => x.id === l.id).name));
    if (l.t === "potion") s.push(`${R.POTION[l.id].name}を使った`);
    if (l.t === "land") s.push(T.landMsg);
    if (l.t === "sea") s.push(T.seaMsg(R.CARD[l.id].name));
  }
  // 3行に収まるように詰める
  const out = []; let line = "";
  for (const x of s) { if ((line + "。" + x).length > 28) { out.push(line); line = x; } else line = line ? line + "。" + x : x; }
  if (line) out.push(line);
  return out.slice(0, 3).join("\n");
}
function findId(uid) { const b = S.b; return [...b.hand, ...b.discard, ...b.draw].find(c => c.uid === uid)?.id; }
// 戦いが終わったら、最後の一撃を見せてから次の画面へ
function afterAction(wait = 0) {
  const b = S.b;
  if (!b.over) return;
  S.lock = true;
  const t = wait + 250;
  if (b.over === "win") { FX.blink("foe", "w", t, 500); FX.burst(FOE[0], FOE[1], ["Y", "w", "g"], 20, t); }
  later(t, () => {
    R.finishBattle(b);
    const over = R.runOver(S.run);
    (over === "win" ? SFX.clear : over === "lose" ? SFX.lose : SFX.win)();
  });
  later(t + 700, () => {
    if (R.runOver(S.run)) { record(); S.mode = "end"; }
    else { S.choices = R.rewardChoices(S.run); S.mode = "reward"; S.rAct = null; S.hover = -1; }
    render();
  });
}

// ---- 勝った後：札を1枚もらう、または手入れ（入れ替え・間引き・漬け直し）を1つ ----
const rotIn = id => (R.CARD[id].rot == null ? null : R.CARD[id].rot + (S.run.rotBonus[id] || 0));
const freshCard = id => ({ id, age: 0, rotten: false, rot: rotIn(id), plus: S.run.plus[id] || 0 });
function go(mode) { S.mode = mode; S.hover = -1; }
function reward() {
  const run = S.run, swap = S.rAct === "swap";
  background(P, S.b.chapter);
  box(70, 4, 180, 14); W(76, 6.5, `${S.b.enemy.name}に勝った！ ${swap ? T.swapPick : T.reward}`, "s12");
  W(258, 6.5, T.hp(run.hp, run.maxHp), "s12 w sh");
  const got = (S.b.got || []).map(g => g.relic ? T.gotRelic(R.RELIC[g.relic].name) : g.potion ? T.gotPotion(R.POTION[g.potion].name) : g.ok ? T.vowOk(R.VOW[g.vow].name) : T.vowNg(R.VOW[g.vow].name));
  if (got.length) W(70, 19, got.join("・"), "s12 w sh");
  const n = S.choices.length, gap = n > 3 ? 50 : 56, a0 = Math.round(160 - (gap * (n - 1) + CW) / 2);
  S.choices.forEach((id, i) => {
    const a = a0 + i * gap;
    drawCard(freshCard(id), a, 28, { lift: S.hover === i, danger: swap && S.hover === i });
    W(a - 6, 94, R.CARD[id].text, "w sh s12 wrap");
    hit(a, 23, CW, CH + 5, () => {
      if (swap) { SFX.click(); S.swapId = id; S.deckAct = "swap"; go("deck"); }
      else { SFX.reward(); R.takeReward(run, id); go("map"); }
    }, i);
  });
  // 手入れの4つ（指すと説明が出る）
  W(42, 126, T.orCare, "s12 w sh");
  const ok = { swap: true, cull: R.canCull(run), extend: run.deck.some(R.canExtend), skip: true };
  T.care.forEach((c, k) => {
    const a = 42 + k * 60, b = 134, on = S.hover === `c${k}`, cancel = swap && c.key === "swap";
    box(a, b, 56, 14, !ok[c.key] ? "k" : cancel ? "r" : on ? "y" : "b", on ? "r" : "w");
    W(a + 4, b + 2.5, cancel ? T.cancel : c.label, ok[c.key] ? (on && !cancel ? "" : "w") : "w fade");
    if (!ok[c.key]) return;
    hit(a, b, 56, 14, () => {
      SFX.click();
      if (c.key === "swap") S.rAct = swap ? null : "swap";
      else if (c.key === "skip") go("map");
      else { S.deckAct = c.key; go("deck"); }
    }, `c${k}`);
  });
  const k = typeof S.hover === "string" && S.hover[0] === "c" ? Number(S.hover.slice(1)) : -1;
  if (k >= 0) W(42, 154, T.care[k].hint, "s12 w sh");
}

// 山札から1枚（漬け直し・強くするは1種）を選ぶ。どこから来たかで、選んだ後と「戻る」の行き先が変わる
const DECK_ACT = {
  swap: { pick: (run, it) => R.swapCard(run, it.i, S.swapId), then: "map", back: "reward" },
  cull: { pick: (run, it) => R.cullCard(run, it.i), then: "map", back: "reward" },
  extend: { kinds: R.canExtend, pick: (run, it) => R.extendRot(run, it.id), then: "map", back: "reward" },
  shopCull: { pick: (run, it) => R.shopCull(run, it.i), then: "shop", back: "shop" },
  shopExtend: { kinds: R.canExtend, pick: (run, it) => R.shopExtend(run, it.id), then: "shop", back: "shop" },
  merge: { kinds: id => R.mergeable(S.run).includes(id), pick: (run, it) => { R.merge(run, it.id); showResult(T.restName, "kame", T.restText, [T.merged(R.CARD[it.id].name)]); }, then: null, back: "rest" },
  power: { kinds: R.canPower, pick: (run, it) => { R.power(run, it.id); showResult(T.restName, "kame", T.restText, [T.powered(R.CARD[it.id].name, R.RUN.rest.power)]); }, then: null, back: "rest" },
};
const chName = () => R.CHAPTERS[S.run.ch].name;
function deckView() {
  const run = S.run, act = S.deckAct, A = DECK_ACT[act];
  background(P, chName());
  box(60, 4, 200, 14); W(66, 6.5, T.deckHead[act](S.swapId && R.CARD[S.swapId].name), "s12");
  const items = A.kinds
    ? [...new Set(run.deck)].filter(A.kinds).map(id => ({ id, i: run.deck.indexOf(id) }))
    : run.deck.map((id, i) => ({ id, i }));
  const cols = Math.max(10, Math.ceil(items.length / 3)), cw = Math.min(30, Math.floor(300 / cols));
  const x0 = Math.round(160 - (cols * cw) / 2);
  items.forEach((it, k) => {
    const a = x0 + (k % cols) * cw, b = 24 + Math.floor(k / cols) * 40, on = S.hover === k, d = R.CARD[it.id];
    box(a, b, cw - 2, 38, on ? "y" : it.id === R.CURSE ? "o" : "w", on ? "r" : "k");
    spr(d.sprite, a + Math.round((cw - 18) / 2), b + 2, 1);
    W(a + 1, b + 20, d.name.slice(0, 4), "s12");
    const r = rotIn(it.id), p = run.plus[it.id];
    W(a + 1, b + 28, act === "power" ? `+${p || 0}` : r == null ? "∞" : `腐${r}`, r == null || act === "power" ? "s12 l" : "s12 r");
    hit(a, b, cw - 2, 38, () => { SFX.reward(); A.pick(run, it); if (A.then) go(A.then); }, k);
  });
  // 指している札の説明
  const it = typeof S.hover === "number" ? items[S.hover] : null;
  box(8, 148, 236, 24, "w");
  if (it) {
    const d = R.CARD[it.id], r = rotIn(it.id);
    const tail = act === "extend" || act === "shopExtend" ? ` → ${r + 1}段で腐る` : act === "power" ? ` 値+${R.RUN.rest.power}` : "";
    W(12, 150.5, `${d.name}（気力${d.cost}）${T.rotStep(r)}${tail}`, "s12");
    W(12, 158.5, d.text, "s12 r");
  } else W(12, 154.5, `山札 ${run.deck.length}枚`, "s12");
  box(252, 152, 56, 16, "b"); W(262, 155, T.back, "w");
  hit(252, 152, 56, 16, () => { SFX.click(); go(A.back); });
}

// ---- 章の地図：段ごとに行き先を選んで進む。最後の段は親分 ----
const NODE = {
  fight: { ch: "戦", col: "w" }, elite: { ch: "精", col: "r" }, event: { ch: "？", col: "s" },
  rest: { ch: "休", col: "g" }, shop: { ch: "店", col: "Y" }, treasure: { ch: "宝", col: "y" }, boss: { ch: "主", col: "r" },
};
const nodeAt = (l, j, n) => [22 + l * 40, 98 + (j - (n - 1) / 2) * 30];
function mapView() {
  const run = S.run, m = run.map, nx = R.nextNodes(run);
  background(P, chName());
  box(6, 4, 160, 16); W(12, 7.5, chName(), "");
  const land = R.CHAPTERS[run.ch].land;
  if (land) W(8, 22, `${T.landHead}「${land.name}」${land.text}`, "s12 w sh");
  relicStrip(176, 17, 8); potionSlots(312 - 17 * Math.min(2, R.potionMax(run)), 17, false);
  W(176, 4, T.hp(run.hp, run.maxHp), "s12 w sh"); W(176, 12, T.gold(run.gold), "s12 w sh"); W(242, 4, T.deckN(run.deck.length), "s12 w sh");
  P.R(8, 34, 304, 112, "k"); P.R(9, 35, 302, 110, "y");
  // 通ってきた道
  for (let l = 1; l <= run.layer; l++) {
    const [a1, b1] = nodeAt(l - 1, run.path[l - 1], m[l - 1].length), [a2, b2] = nodeAt(l, run.path[l], m[l].length);
    for (let t = 0; t <= 1; t += 0.05) P.R(Math.round(a1 + (a2 - a1) * t), Math.round(b1 + (b2 - b1) * t), 2, 2, "N");
  }
  // 今いる所から次の行き先へ（点線）
  if (!run.pending) {
    const [a1, b1] = nodeAt(run.layer, run.path[run.layer], m[run.layer].length);
    nx.forEach((_, j) => {
      const [a2, b2] = nodeAt(run.layer + 1, j, nx.length);
      for (let t = 0.15; t < 0.9; t += 0.1) P.R(Math.round(a1 + (a2 - a1) * t), Math.round(b1 + (b2 - b1) * t), 1, 1, "n");
    });
  }
  m.forEach((layer, l) => layer.forEach((node, j) => {
    const [a, b] = nodeAt(l, j, layer.length), K = NODE[node.kind];
    const here = l === run.layer && j === run.path[l], past = l < run.layer || (l === run.layer && !here);
    const next = !run.pending && l === run.layer + 1, on = next && S.hover === j;
    const s = node.kind === "boss" ? 11 : 8;
    box(a - s, b - s, s * 2, s * 2, past && !here ? "k" : on ? "y" : K.col, here ? "r" : next ? "r" : "k");
    W(a - (node.kind === "boss" ? 4 : 2), b - (node.kind === "boss" ? 4 : 2), K.ch, (past && !here ? "w fade " : "") + (node.kind === "boss" ? "" : "s12"));
    if (l < run.layer && j === run.path[l]) P.R(a - 1, b + s - 3, 2, 2, "r");
    if (node.vow && !past) { box(a + 3, b - s - 3, 9, 8, "r", "k"); W(a + 4, b - s - 2.5, T.vowTag, "w s12"); }
    if (next) hit(a - s, b - s, s * 2, s * 2, () => { SFX.click(); enterNode(j); }, j);
  }));
  // 説明
  const h = !run.pending && typeof S.hover === "number" && nx[S.hover];
  box(8, 150, 236, 22, "w");
  const side = sideHint();
  if (h) W(12, 152.5, h.vow ? T.vowHint(R.VOW[h.vow]) : T.nodeHint[h.kind], "s12");
  else if (side) W(12, 152.5, side.replace(/\n/g, " "), "s12");
  else W(12, 152.5, run.pending ? T.mapStart(chName()) : T.mapPick, "s12");
  if (h && h.vow) W(12, 160.5, T.nodeHint.fight, "s12 m"); else
  W(12, 160.5, T.mapLegend, "s12 m");
  if (run.pending) { box(252, 152, 56, 16, "r"); W(259, 155, T.toBattle, "w"); hit(252, 152, 56, 16, () => { SFX.click(); startBattle(); }); }
}
// 行き先に入る
function enterNode(j) {
  const run = S.run, node = R.goNode(run, j);
  if (R.isBattle(node)) return startBattle();
  if (node.kind === "event") { S.ev = R.pickEvent(run); S.evOut = null; return go("event"); }
  if (node.kind === "rest") return go("rest");
  if (node.kind === "shop") { R.openShop(run); return go("shop"); }
  if (node.kind === "treasure") return showResult(T.treasureName, "kame", T.treasureText, R.treasure(run));
}
function showResult(name, sprite, text, out) { S.ev = { name, sprite, text }; S.evOut = out; go("event"); }

// 休み処：体力を戻すか、札1種を強くするか
function restView() {
  const run = S.run, heal = R.restHeal(run), canP = run.deck.some(R.canPower), canM = R.mergeable(run).length > 0;
  background(P, chName());
  box(86, 6, 148, 16); W(92, 9.5, T.restHead, "");
  W(258, 6.5, T.hp(run.hp, run.maxHp), "s12 w sh");
  [
    { label: T.restGo, hint: T.restHint(heal), ok: true, draw: (a, b) => drawPerson(P, S.owner.hero, a + 28, b + 9), fn: () => { R.rest(run); showResult(T.restName, "kame", T.restText, [`体力+${heal}`]); } },
    { label: T.powerGo, hint: T.powerHint(R.RUN.rest.power), ok: canP, draw: (a, b) => spr("omoshi", a + 22, b + 8, 3), fn: () => { S.deckAct = "power"; go("deck"); } },
    { label: T.mergeGo, hint: T.mergeHint, ok: canM, draw: (a, b) => { spr("daikon", a + 10, b + 14, 2); spr("daikon", a + 50, b + 14, 2); }, fn: () => { S.deckAct = "merge"; go("deck"); } },
  ].forEach((o, k) => {
    const a = 12 + k * 100, b = 30, on = o.ok && S.hover === k;
    box(a, b, 96, 112, on ? "y" : "w", on ? "r" : "k");
    box(a + 4, b + 4, 88, 58, "s");
    o.draw(a, b);
    W(a + 6, b + 66, o.label, (on ? "big r" : "big") + (o.ok ? "" : " fade"));
    o.hint.forEach((s, j) => W(a + 6, b + 92 + j * 6, s, "s12"));
    if (o.ok) hit(a, b, 100, 112, () => { SFX.click(); o.fn(); }, k);
  });
}

// 店：札を買う・間引く・漬け直す（それぞれ1度）。お金は戦いと宝で増える
function shopView() {
  const run = S.run, sh = run.shop;
  background(P, chName());
  box(70, 4, 180, 14); W(76, 6.5, T.shopHead, "s12");
  W(258, 4, T.gold(run.gold), "s12 w sh"); W(258, 12, T.hp(run.hp, run.maxHp), "s12 w sh");
  sh.cards.forEach((it, i) => {
    const a = 70 + i * 66, ok = !it.sold && run.gold >= it.price;
    drawCard(freshCard(it.id), a, 26, { lift: ok && S.hover === i, dim: it.sold });
    W(a - 6, 92, R.CARD[it.id].text, "w sh s12 wrap");
    box(a + 4, 110, 30, 10, it.sold ? "k" : ok ? "Y" : "k", "k");
    W(a + 7, 111.5, it.sold ? T.sold : `${it.price}${T.coin}`, it.sold || !ok ? "s12 w fade" : "s12");
    if (ok) hit(a, 21, CW, CH + 5, () => { SFX.reward(); R.buyCard(run, i); }, i);
  });
  const sv = [
    { label: `${T.care[1].label} ${R.RUN.shop.cull}${T.coin}`, ok: R.canShopCull(run), done: sh.cull, act: "shopCull" },
    { label: `${T.care[2].label} ${R.RUN.shop.extend}${T.coin}`, ok: R.canShopExtend(run), done: sh.extend, act: "shopExtend" },
  ];
  sv.forEach((s, k) => {
    const a = 42 + k * 82, b = 132, on = s.ok && S.hover === `s${k}`;
    box(a, b, 76, 14, s.ok ? (on ? "y" : "b") : "k", on ? "r" : "w");
    W(a + 4, b + 2.5, s.done ? `${s.label.split(" ")[0]} ${T.sold}` : s.label, s.ok ? (on ? "" : "w") : "w fade");
    if (s.ok) hit(a, b, 76, 14, () => { SFX.click(); S.deckAct = s.act; go("deck"); }, `s${k}`);
  });
  // 樽の道具・漬け汁（右の列）
  sh.goods.forEach((it, k) => {
    const a = 250, b = 22 + k * 34, ok = R.canBuyGood(run, k), on = ok && S.hover === `g${k}`;
    const d = it.kind === "relic" ? R.RELIC[it.id] : R.POTION[it.id];
    box(a, b, 64, 31, it.sold ? "k" : on ? "y" : "w", on ? "r" : "k");
    spr(d.sprite, a + 2, b + 2, 1);
    W(a + 20, b + 3, d.name.slice(0, 4), it.sold ? "s12 w fade" : "s12");
    W(a + 20, b + 11, it.kind === "relic" ? T.relicHead : T.potionHead, it.sold ? "s12 w fade" : "s12 m");
    W(a + 3, b + 21, it.sold ? T.sold : `${it.price}${T.coin}`, ok ? "s12 r" : "s12 w fade");
    hit(a, b, 64, 31, () => { if (ok) { SFX.reward(); R.buyGood(run, k); } }, `g${k}`);
  });
  const gh = typeof S.hover === "string" && S.hover[0] === "g" ? sh.goods[+S.hover.slice(1)] : null;
  box(214, 132, 64, 14, "r", "w"); W(222, 134.5, T.leave, "w");
  hit(214, 132, 64, 14, () => { SFX.click(); go("map"); });
  W(42, 152, gh ? `${(gh.kind === "relic" ? R.RELIC : R.POTION)[gh.id].name}：${(gh.kind === "relic" ? R.RELIC : R.POTION)[gh.id].text}` : T.shopHint, "s12 w sh");
  potionSlots(4, 22, false);
}

// できごと：選択肢を選ぶ → 起きたことを見せて地図へ（休み処・宝の結果もここで見せる）
function eventView() {
  const run = S.run, ev = S.ev;
  background(P, chName());
  box(16, 6, 288, 58, "w");
  box(20, 10, 50, 50, "s"); spr(ev.sprite, 21, 11, 3);
  W(78, 10, ev.name, "big");
  ev.text.forEach((s, k) => W(78, 32 + k * 8, s, ""));
  W(220, 66, `${T.hp(run.hp, run.maxHp)} ${T.gold(run.gold)}`, "s12 w sh");
  if (!S.evOut) {
    ev.options.forEach((o, k) => {
      const b = 76 + k * 36, on = S.hover === k;
      box(16, b, 288, 32, "w", on ? "r" : "k");
      W(22, b + 8, o.label, on ? "r" : "");
      if (o.good) W(110, b + 5, `＋ ${o.good}`, "s12 gr");
      if (o.bad) W(110, b + 17, `－ ${o.bad}`, "s12 r");
      if (!o.good && !o.bad) W(110, b + 11, T.nothing.replace("起きなかった", "起きない"), "s12");
      hit(16, b, 288, 32, () => { S.evOut = R.applyEvent(run, ev, k); (o.effects.length ? SFX.reward : SFX.click)(); S.hover = -1; }, k);
    });
    return;
  }
  box(16, 76, 288, 64, "w");
  const out = S.evOut.length ? S.evOut : [T.nothing];
  out.slice(0, 7).forEach((s, k) => W(24, 80 + k * 8, s, /-|腐れ|次の敵/.test(s) ? "r" : ""));
  box(124, 150, 72, 16, "r"); W(134, 153, T.toMap, "w");
  hit(124, 150, 72, 16, () => { SFX.click(); go("map"); });
}

// 挑戦の終わりに1度だけ記録する（保存できなくても続ける）
function record() {
  if (S.run.recorded) return;
  S.run.recorded = true;
  try { S.endInfo = SV.recordRun(S.save, S.run); SV.store(S.save); } catch (e) { S.endInfo = null; }
  S.asc = SV.ascOpen(S.save);
}
function end() {
  const win = R.runOver(S.run) === "win";
  record();
  background(P, win ? "第二章 蔵" : "第一章");
  drawPerson(P, S.owner.hero, 143, 44, false, win ? "k" : "m");
  box(80, 16, 160, 20); W(88, 20, win ? T.win : T.lose);
  W(90, 100, T.endLine(R.DECK[S.run.type].name, S.run.ch + 1, S.run.wins) + (S.run.asc ? ` ${T.ascName(S.run.asc)}` : ""), "w sh");
  // 新しく取れた実績・解放・開いた段
  const info = S.endInfo, lines = [];
  if (info) {
    if (info.ascOpened != null) lines.push(T.ascOpened(info.ascOpened));
    for (const id of info.ach) lines.push(T.achGot(SV.ACHIEVEMENTS.find(a => a.id === id).name));
    for (const o of info.opened) lines.push(T.unlocked((o.kind === "cards" ? R.CARD : o.kind === "relics" ? R.RELIC : R.DECK)[o.id].name));
  }
  lines.slice(0, 4).forEach((s, k) => W(90, 112 + k * 7, s, "s12 Y sh"));
  box(135, 140, 50, 16, "r"); W(142, 143, T.again, "w");
  hit(135, 140, 50, 16, () => { SFX.click(); S.mode = "title"; });
}

// ---- 図鑑（見た札・戦った敵・持った道具） ----
const BOOK_TABS = [
  { key: "cards", label: "札", get: id => R.CARD[id] },
  { key: "foes", label: "敵", get: id => R.ENEMY[id] },
  { key: "relics", label: "道具", get: id => R.RELIC[id] },
];
function bookView() {
  background(P, "第二章 蔵");
  box(6, 4, 100, 16); W(12, 7.5, T.bookGo, "");
  const tab = BOOK_TABS.find(t => t.key === S.bookTab) || BOOK_TABS[0], ids = SV.BOOK[tab.key], seen = S.save.seen[tab.key];
  BOOK_TABS.forEach((t, k) => {
    const a = 112 + k * 40, on = t.key === tab.key;
    box(a, 4, 38, 16, on ? "r" : "w"); W(a + 4, 7.5, `${t.label}`, on ? "w" : "");
    if (!on) hit(a, 4, 38, 16, () => { SFX.click(); S.bookTab = t.key; S.hover = -1; });
  });
  W(236, 7.5, `${seen.length}/${ids.length}`, "w sh");
  const big = tab.key !== "cards", cols = big ? 8 : 16, step = big ? 36 : 18, top = 26;
  P.R(6, top - 2, 308, big ? 112 : 6 * 18 + 4, "k"); P.R(7, top - 1, 306, (big ? 112 : 6 * 18 + 4) - 2, "s");
  ids.forEach((id, i) => {
    const a = 12 + (i % cols) * step, b = top + Math.floor(i / cols) * step, d = tab.get(id), known = seen.includes(id), on = S.hover === `b${i}`;
    if (on) P.R(a - 1, b - 1, (big ? 32 : 16) + 2, (big ? 32 : 16) + 2, "r");
    const sp = d.sprite || "barrel";
    if (big) spr(sp, a, b, 2, known ? {} : solid("b")); else spr(sp, a, b, 1, known ? {} : solid("b"));
    if (d.person && !d.sprite) W(a + 6, b + 6, known ? d.name[0] : "？", "big");
    hit(a, b, big ? 32 : 16, big ? 32 : 16, () => {}, `b${i}`);
  });
  const hv = typeof S.hover === "string" && S.hover[0] === "b" ? ids[+S.hover.slice(1)] : null;
  box(6, 140, 230, 30, "w");
  if (hv) {
    const d = tab.get(hv), known = seen.includes(hv), u = SV.unlockOf(hv);
    W(10, 143, known ? d.name : T.unknown, "");
    W(10, 156, known ? (d.text || d.intro?.title || "") : u && SV.locked(S.save)[tab.key]?.includes(hv) ? T.lockedHow(u.text) : T.unknownHint, "s12");
  } else W(10, 150, T.bookHint, "s12");
  box(250, 150, 60, 16, "r"); W(258, 153, T.back, "w");
  hit(250, 150, 60, 16, () => { SFX.click(); go("title"); });
}

// ---- 実績 ----
function achView() {
  background(P, "第一章");
  box(6, 4, 100, 16); W(12, 7.5, T.achGo, "");
  const got = S.save.ach;
  W(112, 7.5, `${got.length}/${SV.ACHIEVEMENTS.length}`, "w sh");
  W(160, 7.5, T.achStats(S.save), "s12 w sh");
  SV.ACHIEVEMENTS.forEach((a, k) => {
    const x = 6 + (k % 2) * 156, y = 24 + Math.floor(k / 2) * 18, ok = got.includes(a.id);
    box(x, y, 152, 16, ok ? "y" : "w", ok ? "r" : "k");
    W(x + 4, y + 2, (ok ? "★ " : "・ ") + a.name, ok ? "s12 r" : "s12");
    W(x + 70, y + 2, a.text, ok ? "s12" : "s12 fade");
  });
  box(250, 150, 60, 16, "r"); W(258, 153, T.back, "w");
  hit(250, 150, 60, 16, () => { SFX.click(); go("title"); });
}

// ---- 入力 ----
function toArt(ev) {
  const r = cv.getBoundingClientRect();
  return [(ev.clientX - r.left) / r.width * 320, (ev.clientY - r.top) / r.height * 180];
}
// 指は太いので、当たっていなくても近く（pad 点）の一番近いものを選ぶ
function find(ev, pad = 0) {
  const [x, y] = toArt(ev), all = [...hits].reverse();
  const h = all.find(h => x >= h.a && x < h.a + h.w && y >= h.b && y < h.b + h.h);
  if (h || !pad) return h;
  let best = null, bd = pad;
  for (const g of all) {
    const d = Math.hypot(Math.max(g.a - x, 0, x - g.a - g.w), Math.max(g.b - y, 0, y - g.b - g.h));
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}
// マウス：押すと動き、乗せると説明。指：タップで動き、長押しで説明（乗せたときと同じ表示）
const LONG = 380, TOUCH_PAD = 5;
let lastType = "mouse", press = null;
addEventListener("pointerdown", ev => { lastType = ev.pointerType || "mouse"; unlock(); if (lastType !== "mouse") wantFull(); });
cv.addEventListener("click", ev => { if (lastType !== "mouse") return; const h = find(ev); if (h) { h.fn(); render(); } });
cv.addEventListener("mousemove", ev => {
  if (lastType !== "mouse") return;
  const h = find(ev), v = h && h.hover != null ? h.hover : -1;
  cv.style.cursor = h ? "pointer" : "default";
  if (v !== S.hover) { S.hover = v; render(); }
});
cv.addEventListener("pointerdown", ev => {
  if (ev.pointerType === "mouse") return;
  const h = find(ev, TOUCH_PAD);
  press = { h, x: ev.clientX, y: ev.clientY, long: false };
  const me = press;
  me.timer = setTimeout(() => {
    if (press !== me || !h || h.hover == null) return;
    me.long = true; S.hover = h.hover; render(); navigator.vibrate?.(8);
  }, LONG);
});
cv.addEventListener("pointermove", ev => {
  if (!press || ev.pointerType === "mouse") return;
  if (Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 12) { clearTimeout(press.timer); press = null; }
});
cv.addEventListener("pointerup", ev => {
  if (!press || ev.pointerType === "mouse") return;
  const p = press; press = null; clearTimeout(p.timer);
  if (p.long || !p.h) return;
  // 押している間に描き直す（点滅など）と当たり判定は作り直されるので、同じ場所かで比べる
  const h = find(ev, TOUCH_PAD);
  if (!h || h.a !== p.h.a || h.b !== p.h.b || h.w !== p.h.w || h.h !== p.h.h) return;
  S.hover = -1; h.fn(); render();
});
cv.addEventListener("pointercancel", () => { if (press) clearTimeout(press.timer); press = null; });
cv.addEventListener("contextmenu", ev => ev.preventDefault());
addEventListener("keydown", ev => {
  unlock();
  if (ev.key === "m" || ev.key === "M") { toggleMute(); render(); return; }
  if (S.mode === "pick" && ev.key >= "1" && ev.key <= String(R.DECKS.length)) { startRun(R.DECKS[Number(ev.key) - 1].id); render(); return; }
  if (S.mode !== "battle") return;
  if (ev.key === " " || ev.key === "Enter") endTurn();
  else if (ev.key >= "1" && ev.key <= "6") act(Number(ev.key) - 1);
  else return;
  render();
});
// スマホ：最初のタップで全画面・横向きに（できる端末だけ。断られても続ける）
let fullTried = false;
function wantFull() {
  if (fullTried || !matchMedia("(pointer: coarse)").matches) return;
  fullTried = true;
  try {
    const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    const p = req && req.call(el, { navigationUI: "hide" });
    Promise.resolve(p).then(() => screen.orientation?.lock?.("landscape")).catch(() => {});
  } catch (e) { /* 全画面にできない端末（iPhone など）はそのまま */ }
}
// 点を整数倍で拡大する（端末の点で数える。にじまない）。320×180 が入らないほど小さいときだけ縮める
function fit() {
  const vv = window.visualViewport, w = vv ? vv.width : innerWidth, h = vv ? vv.height : innerHeight;
  const dpr = window.devicePixelRatio || 1, kd = Math.floor(Math.min(w / 320, h / 180) * dpr);
  const k = kd >= 1 ? kd / dpr / 4 : Math.min(w / 1280, h / 720);
  document.getElementById("screen").style.transform = `scale(${k})`;
  document.body.classList.toggle("tiny", k < 0.7);
}
addEventListener("resize", fit); addEventListener("orientationchange", () => setTimeout(fit, 200));
window.visualViewport?.addEventListener("resize", fit); fit();
// 腐りそうな札の点滅と揺れのために、戦いの画面だけ時々描き直す
setInterval(() => { if (S.mode === "battle" && S.b && !S.b.over && (S.intro || S.hover === "end" || S.b.hand.some(c => R.rotsAtEnd(S.b, c)))) render(); }, 70);

// 人物は依頼者の絵をなぞった清書（data/people.js）。絵の読み込みを待たない
for (const k of Object.keys(PEOPLE)) S.owner[k] = rasterPeople(PEOPLE[k]);

if (q.get("auto")) { S.run = R.newRun(Number(q.get("seed")) || 1, R.DECK[q.get("deck")] ? q.get("deck") : undefined, Math.min(R.CHAPTERS.length - 1, Number(q.get("ch")) || 0)); if (q.get("boss")) S.run.node = S.run.map.at(-1)[0]; startBattle(); }
render();

document.fonts?.ready.then(render);
if (q.get("debug")) window.__S = S; // 確認用
