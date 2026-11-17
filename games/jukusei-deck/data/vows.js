// 戦いごとの縛り：地図の戦いに付くことがある。選ぶと縛りを受け、勝つと報酬が増える。
// mods: foeHp 敵の体力+% / foeStr 敵の力+ / energyDown 最初の番の気力− / rotDown 札の腐る段−（2より下げない）
// turnLimit: この番までに勝てば報酬（越えると報酬なし。負けではない）
// bonus: gold お金 / rewardPlus 札選び+ / potion 漬け汁1つ / relic 樽の道具1つ
export default [
  { id: "oomono", name: "大物", text: "敵の体力+40%", mods: { foeHp: 40 }, bonus: { gold: 20, rewardPlus: 1 } },
  { id: "ikari", name: "いきり立つ", text: "敵の力+2", mods: { foeStr: 2 }, bonus: { potion: 1, gold: 15 } },
  { id: "kuufuku", name: "空腹", text: "最初の番 気力-2", mods: { energyDown: 2 }, bonus: { gold: 25 } },
  { id: "sokko", name: "速攻", text: "5番までに勝つ", turnLimit: 5, bonus: { gold: 30, potion: 1 } },
  { id: "kusariyasui", name: "蒸し暑い", text: "札の腐る段-1", mods: { rotDown: 1 }, bonus: { rewardPlus: 1, gold: 15 } },
];
