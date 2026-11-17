// 釣り合いを測るための自動プレイ。人の上手な遊び方の下限の目安。
import * as R from "./rules.js";

const has = (c, k) => (c.rotten ? R.CARD[c.id].rotPlay : R.CARD[c.id].play)?.some(o => o[k] != null);

export function botTurn(b) {
  // 漬け汁：精鋭と親分は最初の番に、ほかは体力が3割を切ったら使う
  const low = b.player.hp < b.player.maxHp * 0.3;
  while (b.run.potions.length && !b.over && ((b.kind !== "fight" && b.turn === 1) || low)) R.usePotion(b, 0);
  for (let guard = 0; guard < 20 && !b.over; guard++) {
    const ci = b.hand.findIndex((_, i) => R.canCompost(b, i));
    if (ci >= 0) { R.compost(b, ci); continue; }
    const m = R.intent(b);
    const incoming = m.atk ? R.enemyHit(m, b.enemy.str) * (m.times || 1) : 0;
    const needDef = incoming > b.player.block;
    const opts = b.hand.map((c, i) => ({ c, i })).filter(x => R.canPlay(b, x.i));
    if (!opts.length) break;
    const score = x => {
      let s = R.value(x.c) / Math.max(1, R.cost(x.c));
      if (soon(x.c)) s += 20;                       // 腐る前に使う
      if (needDef && has(x.c, "def")) s += 15;      // 殴られる番は守る
      if (!needDef && has(x.c, "def") && !soon(x.c)) s -= 10; // 殴られない番は守りを寝かせる
      if (x.c.rotten) s += 10;                      // 発酵の札は使う
      if (has(x.c, "atkPerRotten")) s += 4 * b.hand.filter(h => h.rotten).length - 6;
      if (has(x.c, "atkPerPlayed")) s += 5 * b.played - 9;      // 盛り合わせは最後に
      if (has(x.c, "atkPerPoison")) s += b.enemy.poison - 6;
      if (has(x.c, "brine")) s += 6;                            // 漬けるのは先に
      return s;
    };
    opts.sort((x, y) => score(y) - score(x));
    if (score(opts[0]) < 0) break;
    R.play(b, opts[0].i);
  }
}
function soon(c) {
  const rot = R.rotOf(c);
  // 腐ってから使える札（発酵の札）は、わざと腐らせる
  return !c.rotten && rot != null && c.age + 1 >= rot && !R.CARD[c.id].rotPlay;
}

// 戦いと戦いの間の自動の選び方（テストの勝率に使う。人の遊び方の目安）
// 札：腐れ札があれば間引く。山札が16枚を超えたら、型の札でない札（最初の山札のなす・きゅうり等）を間引く。ほかは候補の先頭をもらう
// 地図：戦いの行き先に着くまで選んで進む（宝 > 弱っていれば休み処 > お金があれば店 > できごと > 戦い > 元気なら精鋭）
export function botBetween(run) {
  const pool = R.DECK[run.type].pool, weak = run.deck.findIndex(id => !pool.includes(id));
  const k = run.deck.includes(R.CURSE) ? run.deck.indexOf(R.CURSE) : run.deck.length > 16 ? weak : -1;
  const choices = R.rewardChoices(run);
  if (k >= 0 && R.canCull(run)) R.cullCard(run, k);
  else R.takeReward(run, choices[0]);
  while (!run.pending && !R.runOver(run)) {
    const nodes = R.nextNodes(run), hp = run.hp / run.maxHp;
    const beforeBoss = R.nextNodes({ ...run, layer: run.layer + 1 }).some(n => n.kind === "boss");
    const score = n => ({ treasure: 6, rest: hp < 0.5 || (beforeBoss && hp < 0.8) ? 7 : 1, shop: run.gold >= 45 ? 4 : 0.5, event: 3, fight: 2, elite: hp > 0.75 ? 3.5 : 0, boss: 9 })[n.kind];
    const i = nodes.reduce((best, n, j) => (score(n) > score(nodes[best]) ? j : best), 0);
    const node = R.goNode(run, i);
    if (R.isBattle(node)) { run.pending = true; return; }
    if (node.kind === "treasure") R.treasure(run);
    else if (node.kind === "rest") {
      const id = run.deck.find(R.canPower), m = R.mergeable(run).find(x => pool.includes(x));
      if (hp >= 0.8 && m) R.merge(run, m);
      else if (hp >= 0.8 && id) R.power(run, id); else R.rest(run);
    } else if (node.kind === "shop") {
      R.openShop(run);
      const c = run.deck.indexOf(R.CURSE);
      if (c >= 0) R.shopCull(run, c);
      if (!R.buyGood(run, 0)) R.buyCard(run, 0);   // 道具が買えれば道具（並びの先頭）
    } else {
      const ev = R.pickEvent(run);
      const loss = o => -o.effects.reduce((s, fx) => s + Math.min(0, fx.hp || 0), 0);
      R.applyEvent(run, ev, run.hp - loss(ev.options[0]) < run.maxHp * 0.4 ? 1 : 0);
    }
  }
}
