// 1回の挑戦＝3章（約20〜30分）。章ごとに地図（layers 段）を進み、最後の段で親分と戦う。
// 地図の各段に 2〜3 の行き先（戦い・精鋭・できごと・休み処・店・宝）。最初の段は戦い1つ。
// 敵は、行き先を作るときに章の候補から種で選ぶ。
export default {
  hp: 50,
  energy: 3,
  handMax: 6,
  gold: 20,
  // 最初の山札は型ごと（data/decks.js）
  rewardChoices: 3,
  // もらえる札は cards.js の全部から、ここに書いたものを除く
  rewardExclude: ["nasu", "nuka", "kusare"],
  layers: 8,
  // 行き先の出やすさ（from: その段から出る）。最後の1つ手前の段には必ず休み処を置く
  nodes: {
    fight: { w: 5, from: 1 },
    event: { w: 3, from: 1 },
    elite: { w: 1.5, from: 2 },
    rest: { w: 1.5, from: 3 },
    shop: { w: 1.2, from: 2 },
    treasure: { w: 0.8, from: 2 },
  },
  // 勝ったときのお金
  goldFor: { fight: 15, elite: 30, boss: 45 },
  // 精鋭：体力と力の上乗せ。勝つと札選びが1枚多い
  elite: { hp: 50, str: 1, rewardPlus: 1 },
  // 店の値段
  shop: { own: 35, other: 45, cull: 40, extend: 35, relic: 80, potion: 20 },
  // 漬け汁：持てる数・普通の戦いに勝ったときにもらえる見込み（精鋭と親分は必ず）
  potionMax: 2, potionChance: 0.35,
  // 縛り（data/vows.js）：戦いの行き先に付く見込み（段1から）
  vowChance: 0.3,
  // 樽の道具：精鋭と親分に勝つと1つ。店でも買える
  // 休み処：体力を戻す割合 / 札を強くする量（値 v を使う札の base に足す）
  rest: { heal: 0.3, power: 2 },
  // 宝：お金と型の札1枚と漬け汁
  treasure: { gold: 25 },
  // 章の土地の決まり（land）：その章の戦いの間ずっと効く。効き目の種類は data/relics.js の先頭と同じ
// 章：背景の名前・敵の候補・精鋭の候補・親分の候補・体力の上乗せ（%。親分は bossUp）・力の上乗せ（親分は bossStr）。章を越えると体力が戻る（%）
  chapters: [
    { name: "第一章 畑", enemies: ["aburamushi", "nezumi", "kabi", "shimo"], elites: ["kabi", "shimo"], bosses: ["oyabun", "shiooyakata"], land: { name: "肥えた土", text: "戦いの始めに守り4", fx: { block: 4 } }, hpUp: 10, bossUp: 10, str: 0 },
    { name: "第二章 蔵", enemies: ["karasu", "yadokari", "hae", "kobo"], elites: ["karasu", "yadokari"], bosses: ["ookobo", "oyabun"], land: { name: "カビの蔵", text: "3番ごとに手札が1段漬かる", fx: { moldEvery: 3 } }, hpUp: 40, bossUp: 30, str: 0, bossStr: 1 },
    { name: "第三章 浜", enemies: ["aburamushi", "nezumi", "kabi", "shimo", "karasu", "yadokari", "hae", "kobo"], elites: ["karasu", "kobo", "shimo"], bosses: ["daimohikan"], land: { name: "潮風", text: "2番ごとに一番古い札が塩で1段戻る", fx: { saltEvery: 2 } }, hpUp: 65, bossUp: 45, str: 1, bossStr: 1 },
  ],
  chapterHeal: 30,
  // 敵のいら立ち：この番数ごとに敵の力+1
  rage: 6,
};
