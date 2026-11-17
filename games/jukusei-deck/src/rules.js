// 熟成デッキのルール。画面に依らない。乱数は種から作るので、同じ種なら同じ展開になる。
import CARDS from "../data/cards.js";
import ENEMIES from "../data/enemies.js";
import RUN from "../data/run.js";
import DECKS from "../data/decks.js";
import EVENTS from "../data/events.js";
import RELICS from "../data/relics.js";
import POTIONS from "../data/potions.js";
import COMBOS from "../data/combos.js";
import VOWS from "../data/vows.js";
import ASCENSION from "../data/ascension.js";

export { DECKS, EVENTS, RUN, RELICS, POTIONS, COMBOS, VOWS, ASCENSION };
export const ASC_MAX = ASCENSION.length;
export const CURSE = "kusare";   // できごとで入る厄介な札
export const CARD = Object.fromEntries(CARDS.map(c => [c.id, c]));
export const ENEMY = Object.fromEntries(ENEMIES.map(e => [e.id, e]));
export const DECK = Object.fromEntries(DECKS.map(d => [d.id, d]));
export const REWARD_POOL = CARDS.map(c => c.id).filter(id => !RUN.rewardExclude.includes(id));
// まだ解放していない札・道具（run.locked）は、もらえる札・店・道具の候補に出さない
const isOpen = (run, id) => !(run.locked || []).includes(id);
const rewardPool = run => REWARD_POOL.filter(id => isOpen(run, id));
export const RELIC = Object.fromEntries(RELICS.map(x => [x.id, x]));
export const POTION = Object.fromEntries(POTIONS.map(x => [x.id, x]));
export const VOW = Object.fromEntries(VOWS.map(x => [x.id, x]));

// ---- 札の強化（同じ札2枚を合わせると上位の札「名前＋」。id は元の id に "+"） ----
// 値を使う札は値+2、使わない札は気力2以上なら気力−1、ほかは1枚引くが付く。腐る札は腐る段+1。data の up で上書きできる
export const UP = "+";
export const baseId = id => (id.endsWith(UP) ? id.slice(0, -1) : id);
export const isUp = id => id.endsWith(UP);
function upgrade(c) {
  const usesV = [...c.play, ...(c.rotPlay || [])].some(o => Object.values(o).includes("v"));
  const u = { ...c, id: c.id + UP, up: true };
  if (usesV) u.base = c.base + 2;
  else if (c.cost >= 2) u.cost = c.cost - 1;   // 気力1の札を0にすると、0の札を並べる型が際限なく強くなった（0.7.0）
  else u.play = [...c.play, { draw: 1 }];
  if (c.rot != null) u.rot = c.rot + 1;
  return Object.assign(u, c.up || {});
}
for (const c of CARDS) if (c.id !== CURSE) CARD[c.id + UP] = upgrade(c);
// 合わせられる札（強化前の同じ札が2枚以上）
export function mergeable(run) {
  const n = {};
  for (const id of run.deck) if (!isUp(id) && id !== CURSE) n[id] = (n[id] || 0) + 1;
  return Object.keys(n).filter(id => n[id] >= 2);
}
export function merge(run, id) {
  if (!mergeable(run).includes(id)) return false;
  for (let k = 0; k < 2; k++) run.deck.splice(run.deck.indexOf(id), 1);
  run.deck.push(id + UP);
  return true;
}

// ---- 樽の道具と章の土地の決まり（効き目の種類は data/relics.js の先頭） ----
// 持っている道具と今の章の決まりを足し合わせた効き目
export function perks(run) {
  const out = {};
  const add = fx => { for (const [k, v] of Object.entries(fx || {})) out[k] = (out[k] || 0) + v; };
  for (const id of run.relics || []) add(RELIC[id].fx);
  add(RUN.chapters[run.ch]?.land?.fx);
  return out;
}
export function gainRelic(run, id) {
  if (!id || run.relics.includes(id)) return null;
  run.relics.push(id); see(run, "relics", id);
  if (run.stats) run.stats.maxRelics = Math.max(run.stats.maxRelics, run.relics.length);
  const fx = RELIC[id].fx;
  if (fx.maxHp) { run.maxHp += fx.maxHp; run.hp += fx.maxHp; }
  return id;
}
// まだ持っていない道具から1つ（rare は宝と親分だけ）
export function pickRelic(run, rare = false) {
  const left = RELICS.filter(x => !run.relics.includes(x.id) && (rare || !x.rare) && isOpen(run, x.id));
  return left.length ? left[Math.floor(run.r() * left.length)].id : null;
}

// ---- 漬け汁（使い捨て。戦いの中で気力を使わずに使う） ----
export const potionMax = run => Math.max(1, RUN.potionMax + (perks(run).potionSlot || 0) - (run.ax?.potion || 0));
export function gainPotion(run, id) {
  if (run.potions.length >= potionMax(run)) return null;
  id = id || POTIONS[Math.floor(run.r() * POTIONS.length)].id;
  run.potions.push(id);
  return id;
}
export function usePotion(b, k) {
  const id = b.run.potions[k];
  if (!id || b.over) return false;
  b.run.potions.splice(k, 1);
  if (b.run.stats) b.run.stats.potions++;
  b.log.push({ t: "potion", id });
  runOps(b, POTION[id].ops, null);
  return true;
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(a, r) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- 挑戦 ----
// type は最初に選ぶ型（data/decks.js の id）
// opts: asc 難しさの段（0〜10。1〜asc の決まりを全部重ねる）/ locked まだ解放していない札・道具の id / daily 毎日の挑戦
// opts なしは段0・全部解放（勝率テストはこれで測る）
export function ascFx(asc) {
  const out = {};
  for (const a of ASCENSION) if (a.n <= asc) for (const [k, v] of Object.entries(a.fx)) out[k] = (out[k] || 0) + v;
  return out;
}
export function newRun(seed = 1, type = DECKS[0].id, ch = 0, opts = {}) {
  const asc = Math.max(0, Math.min(ASC_MAX, opts.asc || 0)), ax = ascFx(asc), hp = RUN.hp - (ax.maxHp || 0);
  const run = { seed, type, r: rng(seed), hp, maxHp: hp, deck: [...DECK[type].deck], uid: 0,
    ch: 0, layer: 0, map: null, node: null, gold: Math.max(0, RUN.gold - (ax.gold || 0)), wins: 0, won: false,
    rotBonus: {}, plus: {}, mods: {}, rewardPlus: 0, seen: [], relics: [], potions: [], vow: null,
    asc, ax, locked: [...(opts.locked || [])], daily: !!opts.daily,
    // 図鑑と実績のための記録（src/save.js が挑戦の終わりに読む）
    book: { cards: [], foes: [], relics: [] }, stats: { combos: 0, ferments: 0, maxHit: 0, maxRelics: 0, potions: 0 } };
  for (let i = 0; i < (ax.curse || 0); i++) run.deck.push(CURSE);
  for (const id of run.deck) see(run, "cards", id);
  enterChapter(run, ch);
  return run;
}
// 図鑑に載せる（見た札・戦った敵・持った道具）
export function see(run, kind, id) { const a = run.book?.[kind]; if (a && id && !a.includes(id)) a.push(id); }
const ownPool = run => DECK[run.type].pool.filter(id => rewardPool(run).includes(id));
const pickOne = (a, r) => a[Math.floor(r() * a.length)];

// ---- 章の地図 ----
export const CHAPTERS = RUN.chapters;
export const BATTLE = ["fight", "elite", "boss"];
export const isBattle = node => BATTLE.includes(node.kind);
// 章の地図を種で作る。段0は戦い1つ、最後の段は親分、その1つ手前には必ず休み処
export function makeMap(run) {
  const C = CHAPTERS[run.ch], r = run.r, L = RUN.layers, map = [];
  const foe = kind => pickOne(kind === "boss" ? C.bosses : kind === "elite" ? C.elites : C.enemies, r);
  for (let l = 0; l < L; l++) {
    let kinds;
    if (l === 0) kinds = ["fight"];
    else if (l === L - 1) kinds = ["boss"];
    else {
      const pool = Object.entries(RUN.nodes).filter(([, v]) => l >= v.from).map(([k, v]) => ({ k, w: v.w }));
      const n = r() < 0.5 ? 2 : 3;
      kinds = [];
      while (kinds.length < n && pool.length) {
        let x = r() * pool.reduce((s, p) => s + p.w, 0), j = 0;
        while (x >= pool[j].w) x -= pool[j++].w;
        kinds.push(pool.splice(j, 1)[0].k);
      }
      if (l === L - 2 && !kinds.includes("rest")) kinds[kinds.length - 1] = "rest";
    }
    map.push(kinds.map(kind => {
      if (!BATTLE.includes(kind)) return { kind };
      const node = { kind, enemy: foe(kind) };
      // 縛り：段1からの普通の戦いに付くことがある
      if (kind === "fight" && l >= 1 && r() < RUN.vowChance) node.vow = pickOne(VOWS, r).id;
      return node;
    }));
  }
  return map;
}
// 章に入る（最初の段の戦いが今の行き先になる）
export function enterChapter(run, ch) {
  run.ch = ch; run.layer = 0; run.map = makeMap(run); run.node = run.map[0][0]; run.path = [0];
  run.pending = true;   // 段0の戦いはまだ（地図を見せたら、そのまま戦いへ）
}
// 次に選べる行き先
export function nextNodes(run) { return run.map[run.layer + 1] || []; }
export function goNode(run, i) {
  run.layer++; run.node = run.map[run.layer][i]; run.path = [...(run.path || []), i]; run.pending = isBattle(run.node);
  // 縛りのある戦いを選んだら、縛りを受ける（次の1戦だけ）
  if (run.node.vow) {
    const v = VOW[run.node.vow];
    for (const [k, n] of Object.entries(v.mods || {})) run.mods[k] = (run.mods[k] || 0) + n;
    run.vow = v.id;
  }
  return run.node;
}

// ---- 店（お金で札を買う・間引く・漬け直す。1回の訪問でそれぞれ1度） ----
export function openShop(run) {
  const own = shuffle(ownPool(run).slice(), run.r).slice(0, 2), other = rewardPool(run).filter(id => !ownPool(run).includes(id));
  run.shop = { cards: [...own.map(id => ({ id, price: RUN.shop.own })), { id: pickOne(other, run.r), price: RUN.shop.other }], cull: false, extend: false };
  for (const it of run.shop.cards) see(run, "cards", it.id);
  const relic = pickRelic(run);
  run.shop.goods = [
    ...(relic ? [{ kind: "relic", id: relic, price: RUN.shop.relic }] : []),
    ...shuffle(POTIONS.map(x => x.id), run.r).slice(0, 2).map(id => ({ kind: "potion", id, price: RUN.shop.potion })),
  ];
  return run.shop;
}
export function buyCard(run, k) {
  const it = run.shop.cards[k];
  if (!it || it.sold || run.gold < it.price) return false;
  run.gold -= it.price; it.sold = true; run.deck.push(it.id); return true;
}
// 樽の道具・漬け汁を買う（漬け汁は持てる数まで）
export function canBuyGood(run, k) {
  const it = run.shop.goods[k];
  return !!it && !it.sold && run.gold >= it.price && (it.kind !== "potion" || run.potions.length < potionMax(run));
}
export function buyGood(run, k) {
  if (!canBuyGood(run, k)) return false;
  const it = run.shop.goods[k];
  run.gold -= it.price; it.sold = true;
  if (it.kind === "relic") gainRelic(run, it.id); else gainPotion(run, it.id);
  return true;
}
export function canShopCull(run) { return !run.shop.cull && run.gold >= RUN.shop.cull && canCull(run); }
export function shopCull(run, i) { if (!canShopCull(run)) return false; run.gold -= RUN.shop.cull; run.shop.cull = true; cullCard(run, i); return true; }
export function canShopExtend(run) { return !run.shop.extend && run.gold >= RUN.shop.extend && run.deck.some(canExtend); }
export function shopExtend(run, id) { if (!canShopExtend(run) || !canExtend(id)) return false; run.gold -= RUN.shop.extend; run.shop.extend = true; extendRot(run, id); return true; }

// ---- 休み処（体力を戻す か 札1種を強くする） ----
// 強くできるのは、攻撃か守りに値 v を使う札（毒などは強くならない）
export function canPower(id) { return CARD[id].play.some(o => o.atk === "v" || o.def === "v"); }
export function power(run, id) { if (canPower(id)) run.plus[id] = (run.plus[id] || 0) + RUN.rest.power; }

// ---- 宝（お金と型の札1枚と漬け汁） ----
export function treasure(run) {
  run.gold += RUN.treasure.gold;
  const out = [`お金+${RUN.treasure.gold}`];
  const c = pickOne(ownPool(run), run.r); run.deck.push(c); out.push(`${CARD[c].name}を得た`);
  const p = gainPotion(run); if (p) out.push(`${POTION[p].name}を得た：${POTION[p].text}`);
  return out;
}
// もらえる札：型の札から（choices−1）枚、ほかの札から1枚。できごとで増えた分は型の札から
export function rewardChoices(run) {
  const own = ownPool(run), other = rewardPool(run).filter(id => !own.includes(id));
  const n = RUN.rewardChoices + (run.rewardPlus || 0);
  run.rewardPlus = 0;
  const out = [...shuffle(own.slice(), run.r).slice(0, n - 1), shuffle(other.slice(), run.r)[0]];
  for (const id of out) see(run, "cards", id);
  return out;
}
export function takeReward(run, id) { if (id) { run.deck.push(id); see(run, "cards", id); } }

// ---- 勝った後の札の手入れ ----
export const DECK_MIN = 6;
// 入れ替え：山札の i 番目を、id の札と交換する
export function swapCard(run, i, id) { if (run.deck[i] && id) run.deck[i] = id; }
// 間引き：山札の i 番目を抜く（DECK_MIN 枚までは減らせない）
export function canCull(run) { return run.deck.length > DECK_MIN; }
export function cullCard(run, i) { if (canCull(run) && run.deck[i]) run.deck.splice(i, 1); }
// 漬け直し：その札（同じ種類すべて）の腐る段を1つ先へ延ばす。腐らない札には効かない
export function canExtend(id) { return CARD[id].rot != null; }
export function extendRot(run, id) { if (canExtend(id)) run.rotBonus[id] = (run.rotBonus[id] || 0) + 1; }

// ---- 戦いと戦いの間（分かれ道・できごと・休み） ----
export const REST_HEAL = RUN.rest.heal;
export const restRate = run => Math.max(0, REST_HEAL - (run.ax?.rest || 0) / 100);
export const restHeal = run => Math.min(run.maxHp - run.hp, Math.ceil(run.maxHp * restRate(run)));
export function rest(run) { const n = restHeal(run); run.hp += n; return n; }
// まだ出ていないできごとを1つ
export function pickEvent(run) {
  const left = EVENTS.filter(e => !run.seen.includes(e.id));
  const ev = pickOne(left.length ? left : EVENTS, run.r);
  run.seen.push(ev.id);
  return ev;
}
// できごとの選択肢を実行する。起きたことを短い文で返す（画面に出す）
export function applyEvent(run, ev, k) {
  const out = [], opt = ev.options[k];
  const cname = id => CARD[id].name;
  for (const fx of opt.effects) {
    if (fx.hp != null) { const before = run.hp; run.hp = Math.max(1, Math.min(run.maxHp, run.hp + fx.hp)); out.push(`体力${run.hp >= before ? "+" : ""}${run.hp - before}`); }
    if (fx.maxHp != null) { run.maxHp = Math.max(10, run.maxHp + fx.maxHp); run.hp = Math.max(1, Math.min(run.maxHp, run.hp + Math.max(0, fx.maxHp))); out.push(`最大体力${fx.maxHp > 0 ? "+" : ""}${fx.maxHp}`); }
    if (fx.gainOwn) for (let i = 0; i < fx.gainOwn; i++) { const id = pickOne(ownPool(run), run.r); run.deck.push(id); out.push(`${cname(id)}を得た`); }
    if (fx.gainOther) { const own = ownPool(run), id = pickOne(rewardPool(run).filter(x => !own.includes(x)), run.r); run.deck.push(id); out.push(`${cname(id)}を得た`); }
    if (fx.gainFrom) { const id = pickOne(fx.gainFrom, run.r); run.deck.push(id); out.push(`${cname(id)}を得た`); }
    if (fx.gainId) { run.deck.push(fx.gainId); out.push(`${cname(fx.gainId)}を得た`); }
    if (fx.curse) for (let i = 0; i < fx.curse; i++) { run.deck.push(CURSE); out.push(`${cname(CURSE)}が入った`); }
    if (fx.curseRandom) { const i = randomIndex(run, id => id !== CURSE); if (i >= 0) { out.push(`${cname(run.deck[i])}が${cname(CURSE)}に`); run.deck[i] = CURSE; } }
    if (fx.transformRandom) { const i = randomIndex(run, () => true); if (i >= 0) { const id = pickOne(ownPool(run), run.r); out.push(`${cname(run.deck[i])}が${cname(id)}に化けた`); run.deck[i] = id; } }
    if (fx.extendRandom) { const ids = [...new Set(run.deck)].filter(canExtend); if (ids.length) { const id = pickOne(ids, run.r); extendRot(run, id); out.push(`${cname(id)}の腐る段+1`); } }
    if (fx.rewardPlus) { run.rewardPlus = (run.rewardPlus || 0) + fx.rewardPlus; out.push(`次の札選びが${RUN.rewardChoices + run.rewardPlus}枚に`); }
    if (fx.foeHp) { run.mods.foeHp = (run.mods.foeHp || 0) + fx.foeHp; out.push(`次の敵の体力+${fx.foeHp}%`); }
    if (fx.foeStr) { run.mods.foeStr = (run.mods.foeStr || 0) + fx.foeStr; out.push(`次の敵の力+${fx.foeStr}`); }
    if (fx.energyDown) { run.mods.energyDown = (run.mods.energyDown || 0) + fx.energyDown; out.push(`次の戦いの最初の番 気力-${fx.energyDown}`); }
  }
  return out;
}
function randomIndex(run, ok) {
  const idx = run.deck.map((id, i) => (ok(id) ? i : -1)).filter(i => i >= 0);
  return idx.length && run.deck.length > DECK_MIN ? pickOne(idx, run.r) : idx.length ? pickOne(idx, run.r) : -1;
}
export function runOver(run) { return run.hp <= 0 ? "lose" : run.won ? "win" : null; }

// ---- 戦い ----
// 今の行き先（run.node）の敵と戦う。章の上乗せ・精鋭の上乗せ・できごとの効き目（次の戦いだけ）を足す
export function startBattle(run) {
  const C = CHAPTERS[run.ch], node = run.node, e = ENEMY[node.enemy], elite = node.kind === "elite";
  const mods = run.mods || {}, ax = run.ax || {}, boss = node.kind === "boss";
  const up = boss ? C.bossUp || 0 : C.hpUp;
  // 難しさ：普通の敵と精鋭の体力（foeHp）・精鋭（eliteHp・eliteStr）・親分（bossHp）・全員の力（foeStr）
  const ascHp = boss ? ax.bossHp || 0 : (ax.foeHp || 0) + (elite ? ax.eliteHp || 0 : 0);
  const hp = Math.round(e.hp * (1 + (up + (elite ? RUN.elite.hp : 0) + (mods.foeHp || 0) + ascHp) / 100));
  const str = (boss ? C.bossStr || 0 : C.str) + (elite ? RUN.elite.str + (ax.eliteStr || 0) : 0) + (mods.foeStr || 0) + (ax.foeStr || 0);
  see(run, "foes", e.id);
  const fx = perks(run);
  // 腐る段：漬け直し・古い樽で延び、縛り（蒸し暑い）で縮む（2より下げない。もともと短い札はそのまま）
  const rb = run.rotBonus || {}, rotFor = id => (CARD[id].rot == null ? null : Math.max(Math.min(2, CARD[id].rot), CARD[id].rot + (rb[id] || 0) + (fx.rotPlus || 0) - (mods.rotDown || 0)));
  const b = {
    run, chapter: C.name, kind: node.kind, layer: run.layer + 1, layers: RUN.layers,
    player: { hp: run.hp, maxHp: run.maxHp, block: fx.block || 0, energy: Math.max(0, RUN.energy - (mods.energyDown || 0) + (fx.energyFirst || 0)) },
    enemy: { id: e.id, name: e.name, sprite: e.sprite, hp, maxHp: hp, block: 0, str, poison: 0, brine: 0, split: false, move: 0 },
    draw: shuffle(run.deck.map(id => ({ uid: ++run.uid, id, age: 0, rotten: false, rot: rotFor(id), plus: run.plus?.[id] || 0 })), run.r),
    hand: [], discard: [], eaten: [], played: 0, turn: 1, freeze: !!fx.freezeFirst, over: null, log: [],
    fx, vow: run.vow, turnIds: [], combosDone: [],
  };
  b.enemy.poison = Math.min(POISON_MAX, fx.poison || 0);
  b.enemy.brine = Math.min(BRINE_MAX, fx.brine || 0);
  b.enemy.str = Math.max(0, b.enemy.str - (fx.weaken || 0));
  run.mods = {}; run.pending = false; run.vow = null;
  drawUpTo(b);
  return b;
}

// 腐る段。漬け直し（run.rotBonus）で延びた札は、戦いの札に rot を持つ
export function rotOf(c) { return c.rot !== undefined ? c.rot : CARD[c.id].rot; }
export const GROW_MAX = 4;
export function value(c) {
  const d = CARD[c.id];
  // 腐らない札も、育つのは GROW_MAX 段まで
  const r = rotOf(c), age = r == null ? Math.min(c.age, GROW_MAX) : Math.min(c.age, r - 1);
  return d.base + (c.plus || 0) + d.grow * age;
}
// 敵の動き（k 番先。0 が次）。親分は本気（phase2）になると動きが変わる
export function movesOf(e) { const d = ENEMY[e.id]; return e.phase2 && d.phase ? d.phase.moves : d.moves; }
export function intentAt(b, k = 0) { const moves = movesOf(b.enemy); return moves[(b.enemy.move + k) % moves.length]; }
export function intent(b) { return intentAt(b, 0); }
export function cost(c) { return CARD[c.id].cost; }
// 腐るまであと何番か（腐らない札は Infinity、腐った札は 0）
export function turnsLeft(c) {
  const r = rotOf(c);
  return r == null ? Infinity : c.rotten ? 0 : r - c.age;
}
// この番を終えると腐るか（番の終わりの1段＋敵のカビ。重石の番は漬からない）
export function rotsAtEnd(b, c) {
  const r = rotOf(c);
  if (r == null || c.rotten) return false;
  return c.age + (b.freeze ? 0 : 1) + (intent(b).mold || 0) >= r;
}
export function canPlay(b, i) {
  const c = b.hand[i];
  if (!c || b.over) return false;
  if (c.rotten && !CARD[c.id].rotPlay) return false;
  if (!c.rotten && !CARD[c.id].play.length) return false;   // 腐れ札
  return b.player.energy >= cost(c);
}
// 腐って使えない札は、気力1で堆肥にして捨てる（他の手札が1段漬かる）
export function canCompost(b, i) {
  const c = b.hand[i];
  return !!c && !b.over && c.rotten && !CARD[c.id].rotPlay && b.player.energy >= 1;
}

function rotCheck(b) {
  for (const c of b.hand) {
    const r = rotOf(c);
    if (r != null && c.age >= r && !c.rotten) { c.rotten = true; c.age = r; b.log.push({ t: "rot", uid: c.uid }); }
  }
}
function ageHand(b, n, except) {
  for (const c of b.hand) if (c !== except && !c.rotten) c.age += n;
  rotCheck(b);
}
function toDiscard(b, c) { c.age = 0; c.rotten = false; b.discard.push(c); }
function drawOne(b) {
  if (!b.draw.length) b.draw = shuffle(b.discard.splice(0), b.run.r);
  if (b.draw.length && b.hand.length < RUN.handMax) b.hand.push(b.draw.pop());
}
function drawUpTo(b) {
  while (b.hand.length < RUN.handMax && (b.draw.length || b.discard.length)) drawOne(b);
}
const rottenCount = b => b.hand.filter(c => c.rotten).length;

// 漬けた敵（brine）は、当たるたびの痛手が増える。漬かりは BRINE_MAX 段まで
const BRINE_MAX = 3;
export const PLAYED_MAX = 5;     // 盛り合わせが数えるのは5枚まで（道具と強化で際限なく伸びた。0.7.0）
export const POISON_MAX = 12;   // 毒は12まで（長い挑戦で毒が積み上がりすぎた。0.5.1）
function hitEnemy(b, n) {
  if (n > 0) n += b.enemy.brine;
  const e = b.enemy, blocked = Math.min(e.block, n);
  e.block -= blocked; e.hp -= n - blocked;
  b.log.push({ t: "hit", who: "enemy", n: n - blocked });
  if (b.run?.stats) b.run.stats.maxHit = Math.max(b.run.stats.maxHit, n - blocked);
}
function hitPlayer(b, n) {
  const p = b.player, blocked = Math.min(p.block, n);
  p.block -= blocked; p.hp -= n - blocked;
  b.log.push({ t: "hit", who: "player", n: n - blocked });
}
function checkOver(b) {
  const e = b.enemy;
  // 分裂：一度だけ、半分の体力で起き上がる（毒と漬かりも半分に）
  if (e.hp <= 0 && ENEMY[e.id].split && !e.split) {
    e.split = true; e.hp = Math.ceil(e.maxHp / 2); e.poison = Math.floor(e.poison / 2); e.brine = Math.floor(e.brine / 2);
    b.log.push({ t: "split" });
  }
  // 親分の本気：体力が at を切ったら、動きを入れ替えて最初から
  const ph = ENEMY[e.id].phase;
  if (ph && !e.phase2 && e.hp > 0 && e.hp <= e.maxHp * ph.at) { e.phase2 = true; e.move = 0; b.log.push({ t: "phase", id: e.id }); }
  if (e.hp <= 0) { e.hp = 0; b.over = "win"; }
  else if (b.player.hp <= 0) { b.player.hp = 0; b.over = "lose"; }
}

function heal(b, n) { b.player.hp = Math.min(b.player.maxHp, b.player.hp + n); }
// 敵の一撃。力を下げすぎても0より下にはならない
export function enemyHit(m, str) { return Math.max(0, m.atk + str); }

function runOps(b, ops, c) {
  const v = c ? value(c) : 0;   // 漬け汁と役は札が無い（数だけ）
  const num = x => (x === "v" ? v : x);
  for (const op of ops) {
    if (op.atk != null) for (let k = 0; k < (op.times || 1); k++) hitEnemy(b, num(op.atk));
    if (op.def != null) b.player.block += num(op.def);
    if (op.poison != null) b.enemy.poison = Math.min(POISON_MAX, b.enemy.poison + num(op.poison));
    if (op.heal != null) heal(b, num(op.heal));
    if (op.weaken != null) b.enemy.str = Math.max(0, b.enemy.str - op.weaken);   // 力は0まで
    if (op.energy != null) b.player.energy += op.energy;
    if (op.atkPerAge != null) { const n = b.hand.reduce((s, h) => s + (h.rotten ? 0 : h.age), 0); if (n) hitEnemy(b, op.atkPerAge * n); }
    if (op.rotOldest) {
      const old = b.hand.filter(h => !h.rotten && CARD[h.id].rot != null).sort((x, y) => y.age - x.age)[0];
      if (old) { old.age = rotOf(old); rotCheck(b); }
    }
    if (op.fresh) { const r = b.hand.find(h => h.rotten); if (r) { r.rotten = false; r.age = 0; b.log.push({ t: "fresh", uid: r.uid }); } }
    if (op.poisonPerRotten != null) b.enemy.poison = Math.min(POISON_MAX, b.enemy.poison + op.poisonPerRotten * rottenCount(b));
    if (op.healPerRotten != null) heal(b, op.healPerRotten * rottenCount(b));
    if (op.ageOthers != null) ageHand(b, op.ageOthers, c);
    if (op.freeze) b.freeze = true;
    if (op.salt != null) {
      const old = b.hand.filter(h => h !== c && !h.rotten).sort((x, y) => y.age - x.age)[0];
      if (old) old.age = Math.max(0, old.age - op.salt);
    }
    if (op.atkPerRotten != null) { const n = rottenCount(b); if (n) hitEnemy(b, op.atkPerRotten * n); }
    if (op.atkPerBlock != null && b.player.block) hitEnemy(b, op.atkPerBlock * b.player.block);
    if (op.defPerRotten != null) b.player.block += op.defPerRotten * rottenCount(b);
    if (op.atkPerPoison != null && b.enemy.poison) hitEnemy(b, op.atkPerPoison * b.enemy.poison);
    if (op.atkPerPlayed != null && b.played) hitEnemy(b, op.atkPerPlayed * Math.min(PLAYED_MAX, b.played));
    if (op.brine != null) b.enemy.brine = Math.min(BRINE_MAX, b.enemy.brine + op.brine);
    if (op.draw != null) for (let k = 0; k < op.draw; k++) drawOne(b);
    checkOver(b);
  }
}

export function play(b, i) {
  if (!canPlay(b, i)) return false;
  const c = b.hand[i], d = CARD[c.id];
  b.player.energy -= d.cost;
  b.log.push({ t: "play", id: c.id, rotten: c.rotten, v: value(c) });
  if (c.rotten && b.run?.stats) b.run.stats.ferments++;
  // 腐った札の数を数える効果は、使う札自身を数えない
  b.hand.splice(i, 1);
  runOps(b, c.rotten ? d.rotPlay : d.play, c);
  toDiscard(b, c);
  b.played++;          // 盛り合わせは「この番に先に使った札」を数える
  // 組み合わせの役：この番に使った札で、まだ出ていない役がそろったら出す
  b.turnIds.push(baseId(c.id));
  for (const cb of COMBOS) {
    if (b.over || b.combosDone.includes(cb.id) || !cb.cards.every(id => b.turnIds.includes(id))) continue;
    b.combosDone.push(cb.id);
    b.log.push({ t: "combo", id: cb.id });
    if (b.run?.stats) b.run.stats.combos++;
    runOps(b, cb.ops, null);
  }
  return true;
}
export function compost(b, i) {
  if (!canCompost(b, i)) return false;
  const c = b.hand.splice(i, 1)[0];
  b.player.energy -= 1;
  b.log.push({ t: "compost", id: c.id });
  toDiscard(b, c);
  ageHand(b, 1);
  return true;
}

export function endTurn(b) {
  if (b.over) return;
  // 1. 持ち越した手札が漬かる
  if (!b.freeze) ageHand(b, 1);
  b.freeze = false;
  // 2. 敵の番：毒 → 守りが消える → 動き
  const e = b.enemy;
  if (e.poison > 0) { e.hp -= e.poison; b.log.push({ t: "poison", n: e.poison }); e.poison--; checkOver(b); if (b.over) return; }
  e.block = 0;
  const m = intent(b);
  if (m.def) e.block += m.def;
  if (m.str) e.str += m.str;
  if (m.mold) { ageHand(b, m.mold); b.log.push({ t: "mold", n: m.mold }); }
  if (m.steal) {
    const best = b.hand.filter(c => !c.rotten).sort((x, y) => value(y) - value(x))[0];
    if (best) { b.hand.splice(b.hand.indexOf(best), 1); toDiscard(b, best); b.log.push({ t: "steal", id: best.id }); }
  }
  // ネズミ：一番漬かった札を、この戦いのあいだ食べてしまう
  if (m.eat) {
    const best = b.hand.filter(c => !c.rotten).sort((x, y) => y.age - x.age || value(y) - value(x))[0];
    if (best) { b.hand.splice(b.hand.indexOf(best), 1); b.eaten.push(best); b.log.push({ t: "eat", id: best.id }); }
  }
  // 霜：手札の熟成を戻す
  if (m.chill) { for (const c of b.hand) if (!c.rotten) c.age = Math.max(0, c.age - m.chill); b.log.push({ t: "chill", n: m.chill }); }
  // 塩の親方：一番古い札に塩をすり込んで腐らせる
  if (m.pickle) {
    const old = b.hand.filter(c => !c.rotten && CARD[c.id].rot != null).sort((x, y) => y.age - x.age)[0];
    if (old) { b.log.push({ t: "pickle", id: old.id }); old.age = rotOf(old); rotCheck(b); }
  }
  if (m.atk) for (let k = 0; k < (m.times || 1); k++) { hitPlayer(b, enemyHit(m, e.str)); checkOver(b); if (b.over) break; }
  // 土地の決まり（蔵）：N番ごとに手札が漬かる
  const fx = b.fx || {};
  if (!b.over && fx.moldEvery && b.turn % fx.moldEvery === 0) { ageHand(b, 1); b.log.push({ t: "land", n: 1 }); }
  e.move++;
  // 長引くと敵がいら立つ（rage 番ごとに力+1、+2、+3…と増える。守りで粘りすぎる戦いに歯止め）
  if (RUN.rage && b.turn % RUN.rage === 0) { const n = b.turn / RUN.rage; e.str += n; b.log.push({ t: "rage", n }); }
  if (b.over) return;
  // 3. 自分の番：守りが消え、気力が戻り、6枚まで引く
  b.turn++;
  b.player.block = fx.blockTurn || 0;
  b.player.energy = RUN.energy;
  b.played = 0; b.turnIds = []; b.combosDone = [];
  drawUpTo(b);
  // 土地の決まり（浜）：N番ごとに、一番古い札が塩で1段戻る
  if (fx.saltEvery && b.turn % fx.saltEvery === 0) {
    const old = b.hand.filter(c => !c.rotten && c.age > 0).sort((x, y) => y.age - x.age)[0];
    if (old) { old.age--; b.log.push({ t: "sea", id: old.id }); }
  }
}

// 戦いが終わったら挑戦へ戻す
export function finishBattle(b) {
  const run = b.run;
  run.hp = b.player.hp;
  if (b.over !== "win") return;
  run.wins++;
  const fx = b.fx || {}, got = (b.got = []);
  run.gold += (RUN.goldFor[b.kind] || 0) + (fx.goldWin || 0);
  if (fx.healWin) run.hp = Math.min(run.maxHp, run.hp + fx.healWin);
  if (b.kind === "elite") run.rewardPlus = (run.rewardPlus || 0) + RUN.elite.rewardPlus;
  // 精鋭と親分は樽の道具（親分は珍しいものも）。漬け汁は精鋭と親分で必ず、普通の戦いは時々
  if (b.kind !== "fight") { const id = gainRelic(run, pickRelic(run, b.kind === "boss")); if (id) got.push({ relic: id }); }
  if (b.kind !== "fight" || run.r() < RUN.potionChance) { const id = gainPotion(run); if (id) got.push({ potion: id }); }
  // 縛りの報酬（速攻は番の内に勝ったときだけ）
  if (b.vow) {
    const v = VOW[b.vow], ok = !v.turnLimit || b.turn <= v.turnLimit;
    got.push({ vow: v.id, ok });
    if (ok) {
      const bn = v.bonus;
      if (bn.gold) run.gold += bn.gold;
      if (bn.rewardPlus) run.rewardPlus = (run.rewardPlus || 0) + bn.rewardPlus;
      if (bn.potion) { const id = gainPotion(run); if (id) got.push({ potion: id }); }
      if (bn.relic) { const id = gainRelic(run, pickRelic(run)); if (id) got.push({ relic: id }); }
    }
  }
  if (b.kind !== "boss") return;
  // 親分に勝ったら次の章へ（体力が少し戻る）。最後の章なら挑戦の勝ち
  if (run.ch >= CHAPTERS.length - 1) { run.won = true; return; }
  run.hp = Math.min(run.maxHp, run.hp + Math.ceil(run.maxHp * RUN.chapterHeal / 100));
  enterChapter(run, run.ch + 1);
}
