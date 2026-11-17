// できごと（戦いと戦いの間）。選択肢ごとに良いことと悪いことがある。仕組みは rules.js の applyEvent。
// 効き目の種類: hp 体力± / maxHp 最大体力± / gainOwn 型の札をN枚 / gainOther ほかの型の札1枚 / gainFrom 候補から1枚
//              gainId その札 / curse 腐れ札をN枚 / curseRandom 山札の1枚が腐れ札に / transformRandom 山札の1枚が型の札に化ける
//              extendRandom 山札の1種の腐る段+1 / rewardPlus 次の札選びの候補+N
//              foeHp 次の敵の体力+N% / foeStr 次の敵の力+N / energyDown 次の戦いの最初の番の気力−N
// 文言の good / bad は画面に出す説明（効き目と合わせて直す）。
export default [
  {
    id: "taru", name: "古い樽", sprite: "barrel",
    text: ["道ばたに、ふたの割れた樽が転がっている。", "中から、すっぱい匂いがする。"],
    options: [
      { label: "開ける", good: "型の札を2枚得る", bad: "腐れ札が1枚入る", effects: [{ gainOwn: 2 }, { curse: 1 }] },
      { label: "通り過ぎる", good: "", bad: "", effects: [] },
    ],
  },
  {
    id: "shioya", name: "塩売りの行商人", sprite: "shio",
    text: ["「いい塩だよ。お代は…そうだね、", "  あんたの汗で払ってもらおうか」"],
    options: [
      { label: "買う", good: "塩の札を得る", bad: "体力−6", effects: [{ hp: -6 }, { gainFrom: ["shio", "shiotsubo", "shiokoji"] }] },
      { label: "断る", good: "", bad: "", effects: [] },
    ],
  },
  {
    id: "nukagami", name: "ぬか床の神さま", sprite: "nuka",
    text: ["古いぬか床の奥から、声がする。", "「一枚よこせ。よいものに変えてやろう」"],
    options: [
      { label: "捧げる", good: "山札の1枚が型の札に化ける", bad: "何が化けるかは選べない", effects: [{ transformRandom: 1 }] },
      { label: "かき混ぜて去る", good: "体力+5", bad: "", effects: [{ hp: 5 }] },
    ],
  },
  {
    id: "amamori", name: "雨漏り", sprite: "kame",
    text: ["蔵の屋根から雨が落ちてくる。", "急げば先へ、休めば体が楽になる。"],
    options: [
      { label: "休む", good: "体力+12", bad: "", effects: [{ hp: 12 }] },
      { label: "急ぐ", good: "次の札選びが1枚多い", bad: "次の敵の体力+25%", effects: [{ rewardPlus: 1 }, { foeHp: 25 }] },
    ],
  },
  {
    id: "karasunosu", name: "カラスの巣", sprite: "karasu",
    text: ["木の上に、光るものを集めた巣がある。", "カラスは留守のようだ。"],
    options: [
      { label: "登って取る", good: "ほかの型の札を得る", bad: "体力−8", effects: [{ hp: -8 }, { gainOther: 1 }] },
      { label: "そっとしておく", good: "", bad: "", effects: [] },
    ],
  },
  {
    id: "meijin", name: "漬物名人の小屋", sprite: "omoshi",
    text: ["腰の曲がった名人が、樽を磨いている。", "「漬け方を教えてやる。ただし手伝え」"],
    options: [
      { label: "教わる", good: "山札の1種の腐る段+1", bad: "次の戦いの最初の番 気力−1", effects: [{ extendRandom: 1 }, { energyDown: 1 }] },
      { label: "樽を運ぶ", good: "最大体力+4", bad: "体力−4", effects: [{ maxHp: 4 }, { hp: -8 }] },
    ],
  },
  {
    id: "sakagura", name: "酒蔵の宴", sprite: "bottle",
    text: ["酒蔵から、にぎやかな歌が聞こえる。", "粕をたっぷり分けてくれるらしい。"],
    options: [
      { label: "飲んで騒ぐ", good: "体力+15・粕漬けを得る", bad: "次の敵の力+2", effects: [{ hp: 15 }, { gainId: "kasuzuke" }, { foeStr: 2 }] },
      { label: "粕だけもらう", good: "粕漬けを得る", bad: "", effects: [{ gainId: "kasuzuke" }] },
    ],
  },
  {
    id: "maigo", name: "迷子のモヒカン", sprite: "stick",
    text: ["小さなモヒカンが泣いている。", "「親分とはぐれた…」"],
    options: [
      { label: "送り届ける", good: "最大体力+6", bad: "次の敵の体力+20%", effects: [{ maxHp: 6 }, { foeHp: 20 }] },
      { label: "道だけ教える", good: "体力+4", bad: "", effects: [{ hp: 4 }] },
    ],
  },
  {
    id: "shimoasa", name: "霜の朝", sprite: "shimo",
    text: ["畑が真っ白に凍っている。", "凍った野菜は、なかなか腐らない。"],
    options: [
      { label: "凍らせる", good: "山札の1種の腐る段+1", bad: "体力−5", effects: [{ hp: -5 }, { extendRandom: 1 }] },
      { label: "たき火で温まる", good: "体力+8", bad: "", effects: [{ hp: 8 }] },
    ],
  },
  {
    id: "izumi", name: "発酵の泉", sprite: "kaori",
    text: ["ぶくぶくと泡の立つ泉がある。", "浸けたものは、何かに変わるという。"],
    options: [
      { label: "札を浸ける", good: "型の札を1枚得る・最大体力+3", bad: "山札の1枚が腐れ札に", effects: [{ gainOwn: 1 }, { maxHp: 3 }, { curseRandom: 1 }] },
      { label: "顔を洗う", good: "体力+6", bad: "", effects: [{ hp: 6 }] },
    ],
  },
];
