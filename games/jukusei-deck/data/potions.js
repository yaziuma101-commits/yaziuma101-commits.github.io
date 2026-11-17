// 漬け汁：使い捨ての小道具。戦いの中で、気力を使わずに1度だけ使える。持てるのは2つ（run.js の potionMax）。
// 戦いに勝つと時々もらえる。店でも買える。動き（ops）は札と同じ種類（data/cards.js の先頭）。
export default [
  { id: "umezu", name: "梅酢", sprite: "p_umezu", text: "体力を10戻す", ops: [{ heal: 10 }] },
  { id: "shoyujiru", name: "醤油", sprite: "p_shoyu", text: "攻10", ops: [{ atk: 10 }] },
  { id: "amazujiru", name: "甘酢", sprite: "p_amazu", text: "守12", ops: [{ def: 12 }] },
  { id: "karashijiru", name: "からし汁", sprite: "p_karashi", text: "敵に毒6", ops: [{ poison: 6 }] },
  { id: "nukajiru", name: "糠の汁", sprite: "p_nuka", text: "気力+2", ops: [{ energy: 2 }] },
  { id: "shiomizu", name: "塩水", sprite: "p_shio", text: "敵を漬ける1・この番は漬からない", ops: [{ brine: 1 }, { freeze: 1 }] },
  { id: "sakejiru", name: "酒", sprite: "p_sake", text: "3枚引く", ops: [{ draw: 3 }] },
  { id: "sujiru", name: "酢", sprite: "p_su", text: "腐った札を戻し、守6", ops: [{ fresh: 1 }, { def: 6 }] },
];
