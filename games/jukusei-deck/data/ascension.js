// 難しさの段（0〜10）。クリアすると次の段が開く。段 N は 1〜N の決まりを全部重ねる。
// 効き目: foeHp 普通の敵の体力+% / eliteHp 精鋭の体力+% / bossHp 親分の体力+% / foeStr 敵の力+ / eliteStr 精鋭の力+
//         gold 最初のお金− / rest 休み処で戻る割合−（%） / curse 最初の山札に腐れ札 / potion 漬け汁を持てる数− / maxHp 最大体力−
export default [
  { n: 1, text: "敵の体力+10%", fx: { foeHp: 10 } },
  { n: 2, text: "精鋭の力+1", fx: { eliteStr: 1 } },
  { n: 3, text: "最初のお金-15", fx: { gold: 15 } },
  { n: 4, text: "休み処で戻る体力 30%→20%", fx: { rest: 10 } },
  { n: 5, text: "親分の体力+15%", fx: { bossHp: 15 } },
  { n: 6, text: "最初の山札に腐れ札1枚", fx: { curse: 1 } },
  { n: 7, text: "精鋭の体力+20%", fx: { eliteHp: 20 } },
  { n: 8, text: "漬け汁を1つ少なく持つ", fx: { potion: 1 } },
  { n: 9, text: "最大体力-5", fx: { maxHp: 5 } },
  { n: 10, text: "敵の力+1（全員）", fx: { foeStr: 1 } },
];
