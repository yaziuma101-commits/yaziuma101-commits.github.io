// 組み合わせの役：同じ番に、決まった札をそろえて使うと技が出る（強化した札も同じ札として数える）。
// 1つの役は1番に1度。cards の札を全部使った瞬間に ops が出る。動きの種類は data/cards.js の先頭。
export default [
  { id: "kounomono", name: "香の物", cards: ["daikon", "nuka"], text: "大根・糠床", ops: [{ atk: 6 }, { def: 6 }] },
  { id: "asazanmai", name: "浅漬け三昧", cards: ["kyuri", "myoga", "shoga"], text: "きゅうり・みょうが・生姜", ops: [{ atk: 6 }] },
  { id: "takuandan", name: "重ね漬け", cards: ["daikon", "omoshi"], text: "大根・重石", ops: [{ atk: 12 }] },
  { id: "hakkoen", name: "発酵の宴", cards: ["hakusai", "daizu"], text: "白菜・大豆", ops: [{ poison: 5 }, { atk: 5 }] },
  { id: "umeshiso", name: "梅しそ", cards: ["ume", "shisomaki"], text: "梅・しそ巻き", ops: [{ def: 10 }, { heal: 3 }] },
  { id: "nukanushi", name: "糠床の主", cards: ["nukadama", "furunuka"], text: "糠玉・古糠", ops: [{ poison: 4 }] },
  { id: "makunouchi", name: "幕の内", cards: ["ochazuke", "teishoku"], text: "お茶漬け・定食", ops: [{ atk: 6 }, { def: 4 }] },
  { id: "tsukekomi", name: "漬け込み", cards: ["tsukejiru", "tsukebari"], text: "漬けだれ・漬け針", ops: [{ brine: 1 }, { atk: 5 }, { def: 4 }] },
  { id: "kasuzen", name: "粕漬けの膳", cards: ["kasuzuke", "amazu"], text: "粕漬け・甘酢", ops: [{ brine: 1 }, { atk: 6 }] },
  { id: "shojin", name: "精進", cards: ["ninjin", "yuzu"], text: "人参・柚子", ops: [{ heal: 5 }, { def: 5 }] },
];
