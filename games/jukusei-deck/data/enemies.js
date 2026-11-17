// 敵のデータ。moves を順に繰り返す。
// 動き: atk 攻撃（times 回）/ def 守り / mold 手札すべて熟成+v / steal 一番育った札を捨て札へ / str 攻撃力+v
//       chill 手札すべて熟成−v（霜）/ eat 一番育った札をこの戦いから消す / pickle 一番古い札を腐らせる（塩）
// split: true は、一度だけ倒れても半分の体力で起き上がる（分裂）
// 絵: sprite（data/sprites.js の16×16）か、person（data/people.js の清書。ink は線の色）
// 親分（boss）: intro は登場の名札（title）と台詞（line）。phase は体力が at（割合）を切ったときの本気（台詞と新しい動き）
export default [
  { id: "aburamushi", name: "アブラムシ", sprite: "mushi", hp: 22, moves: [{ atk: 6 }, { mold: 1 }, { atk: 3, times: 2 }] },
  { id: "kabi", name: "カビ", sprite: "kabi", hp: 28, moves: [{ mold: 2 }, { atk: 7 }, { def: 5, atk: 4 }] },
  { id: "oyabun", name: "モヒカン親分", person: "foe", hp: 45, boss: true, moves: [{ atk: 9 }, { mold: 1, def: 8 }, { atk: 4, times: 3 }, { str: 2 }],
    intro: { title: "畑荒らしの頭", line: "この畑の漬物は、ぜんぶ俺たちのもんだ！" },
    phase: { at: 0.5, line: "やるじゃねえか…本気でいくぜ！", moves: [{ atk: 5, times: 2 }, { str: 2, def: 6 }, { atk: 8 }] } },
  { id: "karasu", name: "カラス", sprite: "karasu", hp: 32, moves: [{ steal: 1 }, { atk: 9 }, { atk: 5, times: 2 }] },
  { id: "hae", name: "ハエ", sprite: "hae", hp: 30, moves: [{ atk: 3, times: 3 }, { mold: 2 }, { atk: 10 }] },
  { id: "daimohikan", name: "大モヒカン", person: "foe", ink: "r", hp: 70, boss: true, moves: [{ mold: 2 }, { atk: 14 }, { steal: 1, def: 10 }, { atk: 5, times: 3 }, { str: 3 }],
    intro: { title: "島のいちばん上", line: "漬物の島ごと、まとめて食ってやる！" },
    phase: { at: 0.5, line: "腹が…減ってきたぜ…！", moves: [{ atk: 5, times: 3 }, { mold: 2, str: 2 }, { steal: 1, atk: 9 }, { atk: 13 }] } },
  // ---- 新顔（2026-11-16）。今の型では楽に勝てない仕掛けを1つずつ持つ ----
  { id: "nezumi", name: "ネズミ", sprite: "nezumi", hp: 24, moves: [{ eat: 1 }, { atk: 6 }, { atk: 3, times: 2 }] },
  { id: "shimo", name: "霜", sprite: "shimo", hp: 28, moves: [{ chill: 2, def: 4 }, { atk: 7 }, { chill: 1, atk: 4 }] },
  { id: "shiooyakata", name: "塩の親方", person: "oyakata", hp: 48, boss: true, moves: [{ pickle: 1, atk: 6 }, { atk: 10 }, { def: 10, pickle: 1 }, { str: 2, atk: 4 }],
    intro: { title: "浜の塩焚き", line: "塩はな、すり込むもんだ。お前の札にもな。" },
    phase: { at: 0.5, line: "しょっぱい真似を…！", moves: [{ pickle: 1, atk: 6 }, { def: 8, str: 2 }, { atk: 10 }] } },
  { id: "yadokari", name: "ヤドカリ", sprite: "yadokari", hp: 26, moves: [{ def: 12 }, { atk: 8 }, { def: 8, atk: 4 }] },
  { id: "kobo", name: "酵母", sprite: "kobo", hp: 20, split: true, moves: [{ atk: 5 }, { mold: 1, atk: 3 }, { atk: 4, times: 2 }] },
  { id: "ookobo", name: "大酵母", sprite: "ookobo", hp: 44, boss: true, split: true, moves: [{ mold: 2 }, { atk: 12 }, { atk: 5, times: 2 }, { str: 2 }],
    intro: { title: "蔵の主", line: "ぷく…ぷくぷく…（ふくらんでいる）" },
    phase: { at: 0.5, line: "ぷくぷくぷくぷく！！", moves: [{ mold: 2 }, { atk: 5, times: 2 }, { str: 2, atk: 6 }] } },
];
