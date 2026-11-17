// 最初に選ぶデッキの型。deck は最初の山札、pool はその型の札（もらえる札は pool から2枚・ほかから1枚）。
// 型を足すときは1つ足すだけ。札そのものは data/cards.js。
export default [
  {
    id: "asa", name: "浅漬け速攻", sprite: "ichiyazuke",
    how: ["早く育ち、早く腐る札で押す。", "寝かせるのは1〜2番まで。"],
    deck: ["kyuri", "kyuri", "kyuri", "ichiyazuke", "ichiyazuke", "myoga", "myoga", "nasu", "nasu", "nuka"],
    pool: ["kyuri", "myoga", "shoga", "takana", "rakkyo", "shiso", "ichiyazuke", "sokuseki", "ippon", "shiomomi", "senmai"],
  },
  {
    id: "furu", name: "古漬け大技", sprite: "takuan",
    how: ["大根を長く寝かせて一撃。", "重石と塩で腐るのを遅らせる。"],
    deck: ["daikon", "daikon", "daikon", "takuan", "nasu", "nasu", "bettara", "bettara", "omoshi", "nuka"],
    pool: ["daikon", "gobo", "miso", "omoshi", "shio", "kame", "umami", "kombu", "takuan", "bettara", "yamagobo", "iburi"],
  },
  {
    id: "hakko", name: "発酵", sprite: "hakusai",
    how: ["わざと腐らせて化けさせる。", "腐った札が多いほど強い札がある。"],
    deck: ["hakusai", "hakusai", "daizu", "daizu", "kyuri", "kyuri", "nasu", "nasu", "nasu", "nuka"],
    pool: ["hakusai", "daizu", "furuzuke", "kaori", "fuyodo", "nattokin", "narezushi", "funazushi", "kusaya", "shottsuru", "tougarashi", "aokabi", "hishio", "shiokara", "kuroninniku"],
  },
  {
    id: "ume", name: "梅の守り", sprite: "umeboshi",
    how: ["腐らない札で守って耐える。", "守りを攻撃に変えて押し返す。"],
    deck: ["ume", "ume", "karikari", "umeboshi", "kyuri", "kyuri", "kyuri", "nasu", "nasu", "nuka"],
    pool: ["ume", "ninjin", "taru", "yuzu", "sakekasu", "su", "kabu", "nozawana", "karashi", "umeboshi", "karikari", "umeshu", "shisomaki", "tane"],
  },
  // ---- 攻め方の違う型（2026-11-16） ----
  {
    id: "nukadoko", name: "糠床の毒", sprite: "nukamiso",
    how: ["毒で毎番少しずつ削る。", "守りの厚い敵にも毒は通る。"],
    deck: ["nukamiso", "nukazuke", "iriko", "kyuri", "kyuri", "kyuri", "kyuri", "daikon", "nasu", "nuka"],
    pool: ["nukamiso", "nukazuke", "nukadama", "furunuka", "nukauchi", "iriko", "karashinuka", "shoyu", "kusaya"],
  },
  {
    id: "mori", name: "盛り合わせ", sprite: "moriawase",
    how: ["安い札を何枚も並べ、", "最後に盛り合わせで締める。"],
    deck: ["kozara", "tsumami", "moriawase", "kyuri", "kyuri", "nasu", "nasu", "nasu", "nasu", "nuka"],
    pool: ["moriawase", "osechi", "kozara", "tsumami", "hashiyasume", "ochazuke", "teishoku", "myoga", "shiso"],
  },
  {
    id: "teki", name: "相手を漬ける", sprite: "shiotsubo",
    how: ["敵を漬けると、当たるたび", "痛手が増える。小さな連打で。"],
    deck: ["tsukejiru", "tsukejiru", "tsukebari", "tsukebari", "shiotsubo", "amazu", "nasu", "nasu", "nasu", "nuka"],
    pool: ["shiotsubo", "dobuzuke", "tsukejiru", "tsukebari", "amazu", "shiokoji", "kasuzuke", "rakkyo", "funazushi"],
  },
  // ---- 解放される型（data/unlocks.js。0.8.0） ----
  {
    id: "yose", name: "寄せ漬け", sprite: "shibazuke",
    how: ["いろんな漬け方を少しずつ。", "漬けて、守って、腐らせる。"],
    deck: ["shibazuke", "shibazuke", "kimuchi", "misozuke", "kyuri", "kyuri", "nasu", "nasu", "nuka", "hoshigaki"],
    pool: ["shibazuke", "kimuchi", "misozuke", "hoshigaki", "kabu", "takana", "iriko", "tsukejiru", "hakusai", "ume"],
  },
];
