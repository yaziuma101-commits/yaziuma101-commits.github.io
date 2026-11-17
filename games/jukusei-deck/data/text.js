// 画面の文言。英語を足すときはここに en を並べる（あとから集めると高くつく）
// 縛りの報酬の短い説明
function bonusText(v) {
  const b = v.bonus, s = [];
  if (b.gold) s.push(`お金+${b.gold}`); if (b.rewardPlus) s.push(`札選び+${b.rewardPlus}`);
  if (b.potion) s.push("漬け汁"); if (b.relic) s.push("樽の道具");
  return s.join("・");
}
export const T = {
  title: "熟成デッキ",
  start: "はじめる",
  howto: ["手札は捨てずに次の番へ持ち越す。", "寝かせた札は1段ずつ漬かって強くなる。", "漬けすぎると腐る。腐りを活かす札もある。"],
  endTurn: ["寝かせて", "終了"],
  energy: "気力",
  pile: (d, s) => `山${d} 捨${s}`,
  fight: (ch, n, all, kind) => `${ch} ${n}/${all}${kind === "elite" ? " 精鋭" : kind === "boss" ? " 親分" : ""}`,
  reward: "札を1枚もらう",
  skip: "もらわない",
  win: "島いちばんの漬物屋！",
  lose: "漬物は腐ってしまった…",
  again: "もう一度",
  next: "次の戦いへ",
  rotWarn: "次で腐る",
  left: "あと", endRots: "この番を終えると腐る：", endSafe: "この番を終えても、腐る札はない",
  rotten: "腐",
  compostHint: "腐っている。クリックで堆肥（気力1・他の札が1段漬かる）",
  turnStart: "どれを使い、どれを寝かせる？",
  pick: "漬け方の型を選ぶ",
  pickDeck: "最初の札",
  // 演出で飛ぶ字・音の切り替え
  soundOn: "音 入", soundOff: "音 切",
  blocked: "防がれた", guarded: "防いだ", poison: "毒", rotNow: "腐った", freshNow: "漬け直し",
  mold: "カビ", stolen: "を奪われた", ferment: "発酵！",
  eaten: "を食べられた", chill: "霜", pickled: "に塩", split: "分裂！", splitTag: "分裂する",
  pickGo: "これで始める",
  // 勝った後の手入れ・分かれ道・できごと（0.5.0）
  care: [
    { key: "swap", label: "入れ替え", hint: "候補の札1枚と、山札の札1枚を取りかえる" },
    { key: "cull", label: "間引き", hint: "山札から札を1枚抜く（6枚より減らせない）" },
    { key: "extend", label: "漬け直し", hint: "山札の札1種の、腐る段を1つ先へ延ばす" },
    { key: "skip", label: "もらわない", hint: "何ももらわずに進む" },
  ],
  orCare: "札をもらう代わりに、どれか1つ：",
  swapPick: "入れる札を選ぶ", cancel: "やめる", back: "戻る",
  deckHead: { merge: () => "合わせる札を選ぶ（同じ札2枚→上位1枚）", swap: n => `${n}と取りかえる札を選ぶ`, cull: () => "抜く札を選ぶ", extend: () => "腐る段を延ばす札を選ぶ", shopCull: () => "抜く札を選ぶ（店）", shopExtend: () => "腐る段を延ばす札を選ぶ（店）", power: () => "強くする札を選ぶ（同じ札すべて）" },
  rotStep: r => (r == null ? "腐らない" : `${r}段で腐る`),
  hp: (h, m) => `体力 ${h}/${m}`, gold: g => `お金 ${g}`, deckN: n => `山札 ${n}枚`, coin: "文",
  // 地図
  mapPick: "次の行き先を選ぶ（右へ進む。最後に親分）", mapStart: ch => `${ch}。まずは戦い`, toMap: "地図へ",
  mapLegend: "戦=戦い 精=精鋭 ？=できごと 休=休み処 店=店 宝=宝 主=親分",
  nodeHint: { fight: "戦い：勝つとお金と札", elite: "精鋭：強いが、樽の道具と漬け汁が手に入る", event: "できごと：良いことと悪いことがある", rest: "休み処：体力を戻すか、札を強くする", shop: "店：札・樽の道具・漬け汁を買う。間引く・漬け直す", treasure: "宝：お金と札1枚と漬け汁", boss: "親分：勝てば次の章へ" },
  restHead: "休み処。どれにする？", powerGo: "強くする", powerHint: n => [`札1種の値を+${n}`, "（攻撃か守りの札）"], powered: (n, k) => `${n}の値+${k}`,
  treasureName: "宝の甕", treasureText: ["土に埋まった甕を掘り出した。", "中に何か入っている。"],
  shopHead: "漬物屋。お金で札を買える", sold: "売切", leave: "店を出る", shopHint: "間引き・漬け直しは、店でも1度ずつできる",
  endLine: (t, ch, w) => `${t}で 第${ch}章まで・${w}戦 勝った`,
  restGo: "休む", restHint: n => [n ? `体力を${n}戻す` : "体力は満タン", "（何も起きない）"],
  restName: "ひと休み", restText: ["樽に腰かけて、ひと息つく。", "風が気持ちいい。"],
  nothing: "何も起きなかった", toBattle: "次の戦いへ",
  // 0.6.0：樽の道具・漬け汁・役・縛り・土地・強化
  relicHead: "樽の道具", potionHead: "漬け汁", landHead: "土地",
  potionUse: "タップで使う（気力0）", potionEmpty: "漬け汁なし",
  combo: n => `役「${n}」！`, comboOf: n => `役:${n}`,
  vowTag: "縛", vowHint: v => `縛り「${v.name}」${v.text} → 勝つと ${bonusText(v)}`,
  gotRelic: n => `${n}を得た`, gotPotion: n => `${n}を得た`, vowOk: n => `縛り「${n}」を果たした`, vowNg: n => `縛り「${n}」は果たせず`,
  mergeGo: "合わせる", mergeHint: ["同じ札2枚を1枚の", "上位の札（＋）に"], merged: n => `${n}＋ができた`,
  landMsg: "蔵のカビで手札が1段漬かった", seaMsg: n => `潮風で${n}が1段戻った`,
  phase: "本気！",
  rage: n => `いら立ち 力+${n}`, rageMsg: n => `長引いて、敵がいら立った（力+${n}）`,
  // 0.8.0：難しさ・解放・図鑑・毎日の挑戦・実績
  dailyGo: "今日の挑戦", bookGo: "図鑑", achGo: "実績", dailyTag: "今日の挑戦",
  dailyHint: (d, a) => `今日の挑戦：${d}・難しさ${a}（日ごとに変わる）`,
  dailyDone: (d, won) => `今日の挑戦：${d}で${won ? "クリア！" : "挑戦ずみ（何度でも遊べる）"}`,
  lockedName: "？？？", lockedHow: t => `解放：${t}`,
  ascName: n => (n ? `難しさ${n}` : "難しさ0"),
  ascRule: a => `段${a.n}：${a.text}（それまでの段も重なる）`,
  ascNone: open => (open ? "決まりなし。右の矢印で難しく" : "クリアすると難しさ1が開く"),
  ascOpened: n => `難しさ${n}が開いた`, achGot: n => `実績「${n}」を取った`, unlocked: n => `${n}が解放された`,
  unknown: "？？？", unknownHint: "まだ見ていない", bookHint: "指すと説明。挑戦で見た札・戦った敵・持った道具が載る",
  achStats: sv => `クリア${sv.clears}回・最高 難しさ${Math.max(0, sv.maxAsc)}`,
};
