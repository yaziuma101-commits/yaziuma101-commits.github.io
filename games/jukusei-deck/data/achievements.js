// 実績。st は記録（src/save.js の stats）。check が真になったら取れる。
export default [
  { id: "first", name: "初出荷", text: "1回クリア", check: st => st.clears >= 1 },
  { id: "three", name: "三つの樽", text: "3つの型でクリア", check: st => Object.keys(st.clearDecks).length >= 3 },
  { id: "all", name: "漬物屋の主", text: "全部の型でクリア", check: (st, all) => all.every(id => st.clearDecks[id] != null) },
  { id: "asc3", name: "塩辛い道", text: "難しさ3でクリア", check: st => st.maxAsc >= 3 },
  { id: "asc6", name: "からい道", text: "難しさ6でクリア", check: st => st.maxAsc >= 6 },
  { id: "asc10", name: "島いちばん", text: "難しさ10でクリア", check: st => st.maxAsc >= 10 },
  { id: "combo10", name: "盛り付け上手", text: "役を10回出す", check: st => st.combos >= 10 },
  { id: "ferment30", name: "発酵の目利き", text: "腐った札を30回使う", check: st => st.ferments >= 30 },
  { id: "hit30", name: "大当たり", text: "1回で30以上の痛手", check: st => st.maxHit >= 30 },
  { id: "relic8", name: "道具持ち", text: "樽の道具を8つ持つ", check: st => st.maxRelics >= 8 },
  { id: "potion20", name: "汁好き", text: "漬け汁を20回使う", check: st => st.potions >= 20 },
  { id: "daily", name: "今日の一樽", text: "毎日の挑戦をクリア", check: st => st.dailyClears >= 1 },
  { id: "book", name: "図鑑の半分", text: "図鑑の札を半分見る", check: (st, all, seen) => seen >= 0.5 },
];
