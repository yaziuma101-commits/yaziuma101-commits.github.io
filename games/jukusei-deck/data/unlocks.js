// 解放：はじめは隠れていて、条件を満たすと出てくる札・道具・型。
// need: clears クリアの回数 / asc この段以上でクリア / decks クリアした型の数 / ach 実績の数
// what: cards 札（cards.js の id）/ relics 道具 / decks 型
export default [
  { id: "u1", text: "1回クリア", need: { clears: 1 }, what: { cards: ["misozuke", "hoshigaki"] } },
  { id: "u2", text: "2回クリア", need: { clears: 2 }, what: { relics: ["sunoko"] } },
  { id: "u3", text: "難しさ2でクリア", need: { asc: 2 }, what: { cards: ["shibazuke", "kimuchi"] } },
  { id: "u4", text: "3つの型でクリア", need: { decks: 3 }, what: { decks: ["yose"] } },
  { id: "u5", text: "実績を5つ", need: { ach: 5 }, what: { relics: ["kamidana"] } },
];
