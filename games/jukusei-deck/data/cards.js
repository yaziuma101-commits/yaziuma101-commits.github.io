// 札のデータ。仕組みは src/rules.js。ここに足すだけで札が増える。
// base + grow×熟成 が今の値 v。熟成が rot に達すると腐る（rot: null は腐らない）。
// play: 使ったときの動き。rotPlay: 腐ってから使ったときの動き（null なら腐ると使えない）。
// 動きの種類: atk 攻撃 / def 守り / poison 毒 / ageOthers 他の手札の熟成+ / freeze この番は熟成しない
//            salt 一番古い札の熟成− / atkPerRotten 手札の腐った札1枚ごとに攻撃 / draw 引く / heal 回復
//            times 攻撃の回数 / weaken 敵の力− / energy 気力+ / atkPerAge 手札の段の合計×攻撃
//            rotOldest 一番古い札を腐らせる / fresh 腐った札を1枚 段0に戻す
//            poisonPerRotten・healPerRotten・defPerRotten 腐った札1枚ごとに毒・回復・守り
//            atkPerBlock 今の守り×攻撃 / atkPerPoison 敵の毒×攻撃
//            atkPerPlayed この番に先に使った札の数×攻撃 / brine 敵を漬ける（当たるたびの痛手+。3段まで、ずっと残る）
// 数の "v" は今の値に置き換わる。
export default [
  // ---- 最初の山札 ----
  { id: "daikon", name: "大根", sprite: "daikon", cost: 2, base: 4, grow: 3, rot: 5, play: [{ atk: "v" }], rotPlay: null, text: "攻撃。古漬けで大技" },
  { id: "kyuri", name: "きゅうり", sprite: "kyuri", cost: 1, base: 3, grow: 4, rot: 3, play: [{ atk: "v" }], rotPlay: null, text: "早く育ち、すぐ腐る" },
  { id: "nasu", name: "なす", sprite: "nasu", cost: 1, base: 4, grow: 2, rot: 4, play: [{ def: "v" }], rotPlay: null, text: "守り" },
  { id: "nuka", name: "糠床", sprite: "nuka", cost: 0, base: 0, grow: 0, rot: 6, play: [{ ageOthers: 1 }], rotPlay: null, text: "他の手札を1段漬ける" },
  // ---- もらえる札 ----
  { id: "ume", name: "梅", sprite: "ume", cost: 1, base: 3, grow: 1, rot: null, play: [{ atk: "v" }], rotPlay: null, text: "腐らない" },
  { id: "kabu", name: "かぶ", sprite: "kabu", cost: 1, base: 3, grow: 2, rot: 4, play: [{ atk: "v" }, { def: 3 }], rotPlay: null, text: "攻撃と守り3" },
  { id: "omoshi", name: "重石", sprite: "omoshi", cost: 1, base: 0, grow: 0, rot: null, play: [{ freeze: 1 }], rotPlay: null, text: "この番は熟成しない" },
  { id: "shio", name: "塩", sprite: "shio", cost: 0, base: 0, grow: 0, rot: null, play: [{ salt: 2 }], rotPlay: null, text: "一番古い札を2段戻す" },
  { id: "shoga", name: "生姜", sprite: "shoga", cost: 0, base: 1, grow: 1, rot: 4, play: [{ atk: "v" }, { draw: 1 }], rotPlay: null, text: "小攻撃して1枚引く" },
  { id: "ninjin", name: "人参", sprite: "ninjin", cost: 2, base: 6, grow: 2, rot: 6, play: [{ def: "v" }, { heal: 2 }], rotPlay: null, text: "守りと回復2" },
  // ---- 発酵の型（腐ってからが本番） ----
  { id: "hakusai", name: "白菜", sprite: "hakusai", cost: 1, base: 2, grow: 2, rot: 2, play: [{ atk: "v" }], rotPlay: [{ atk: 5 }, { poison: 3 }], text: "腐ると キムチ：攻5 毒3" },
  { id: "daizu", name: "大豆", sprite: "daizu", cost: 1, base: 2, grow: 1, rot: 2, play: [{ def: "v" }], rotPlay: [{ atkPerRotten: 4 }], text: "腐ると 納豆：腐った札1枚ごとに攻4" },
  { id: "furuzuke", name: "古漬け", sprite: "furuzuke", cost: 1, base: 2, grow: 2, rot: 3, play: [{ atk: "v" }], rotPlay: [{ poison: 6 }], text: "腐ると 毒6" },
  { id: "kaori", name: "発酵の香り", sprite: "kaori", cost: 1, base: 0, grow: 0, rot: null, play: [{ atkPerRotten: 5 }], rotPlay: null, text: "腐った札1枚ごとに攻5" },
  { id: "fuyodo", name: "腐葉土", sprite: "fuyodo", cost: 1, base: 0, grow: 0, rot: null, play: [{ defPerRotten: 4 }], rotPlay: null, text: "腐った札1枚ごとに守4" },
  // ---- 40種へ（2026-11-16）。育てる札 ----
  { id: "rakkyo", name: "らっきょう", sprite: "rakkyo", cost: 1, base: 1, grow: 1, rot: 5, play: [{ atk: "v", times: 2 }], rotPlay: null, text: "2回攻撃" },
  { id: "gobo", name: "ごぼう", sprite: "gobo", cost: 2, base: 4, grow: 2, rot: 8, play: [{ atk: "v" }], rotPlay: null, text: "育ちは遅いが、なかなか腐らない" },
  { id: "myoga", name: "みょうが", sprite: "myoga", cost: 0, base: 1, grow: 2, rot: 3, play: [{ atk: "v" }], rotPlay: null, text: "気力0の小攻撃" },
  { id: "takana", name: "高菜", sprite: "takana", cost: 1, base: 2, grow: 2, rot: 4, play: [{ atk: "v" }, { draw: 1 }], rotPlay: null, text: "攻撃して1枚引く" },
  { id: "nozawana", name: "野沢菜", sprite: "nozawana", cost: 1, base: 2, grow: 2, rot: 5, play: [{ def: "v" }, { draw: 1 }], rotPlay: null, text: "守って1枚引く" },
  { id: "karashi", name: "からし", sprite: "karashi", cost: 1, base: 2, grow: 1, rot: 4, play: [{ atk: "v" }, { weaken: 1 }], rotPlay: null, text: "攻撃して敵の力−1" },
  { id: "yuzu", name: "柚子", sprite: "yuzu", cost: 1, base: 2, grow: 1, rot: 5, play: [{ heal: "v" }], rotPlay: null, text: "回復" },
  { id: "shiso", name: "しそ", sprite: "shiso", cost: 0, base: 0, grow: 0, rot: 2, play: [{ energy: 1 }], rotPlay: null, text: "気力+1。すぐ腐る" },
  { id: "miso", name: "味噌", sprite: "miso", cost: 2, base: 3, grow: 2, rot: null, play: [{ atk: "v" }], rotPlay: null, text: "腐らない。じっくり育つ" },
  { id: "taru", name: "樽", sprite: "barrel", cost: 1, base: 3, grow: 1, rot: null, play: [{ def: "v" }], rotPlay: null, text: "守り。腐らない" },
  // ---- 漬け方を変える札 ----
  { id: "kombu", name: "昆布", sprite: "kombu", cost: 1, base: 0, grow: 0, rot: null, play: [{ ageOthers: 2 }], rotPlay: null, text: "他の手札を2段漬ける" },
  { id: "sakekasu", name: "酒粕", sprite: "sakekasu", cost: 1, base: 0, grow: 0, rot: null, play: [{ def: 4 }, { ageOthers: 1 }], rotPlay: null, text: "守4。他の手札を1段漬ける" },
  { id: "umami", name: "旨み", sprite: "umami", cost: 1, base: 0, grow: 0, rot: null, play: [{ atkPerAge: 1 }], rotPlay: null, text: "手札の段の合計だけ攻撃" },
  { id: "su", name: "酢", sprite: "su", cost: 1, base: 0, grow: 0, rot: null, play: [{ fresh: 1 }, { def: 3 }], rotPlay: null, text: "腐った札を1枚 漬け直す。守3" },
  { id: "kame", name: "甕", sprite: "kame", cost: 1, base: 0, grow: 0, rot: null, play: [{ freeze: 1 }, { def: 5 }], rotPlay: null, text: "守5。この番は熟成しない" },
  { id: "kouji", name: "麹", sprite: "kouji", cost: 1, base: 0, grow: 0, rot: null, play: [{ draw: 2 }], rotPlay: null, text: "2枚引く" },
  { id: "shoyu", name: "醤油", sprite: "bottle", cost: 1, base: 0, grow: 0, rot: null, play: [{ poison: 4 }], rotPlay: null, text: "毒4" },
  // ---- 発酵の型 ----
  { id: "nattokin", name: "納豆菌", sprite: "nattokin", cost: 1, base: 0, grow: 0, rot: null, play: [{ rotOldest: 1 }, { draw: 1 }], rotPlay: null, text: "一番古い札を腐らせ、1枚引く" },
  { id: "narezushi", name: "なれずし", sprite: "narezushi", cost: 2, base: 2, grow: 1, rot: 3, play: [{ atk: "v" }], rotPlay: [{ atk: 15 }], text: "腐ると 攻15" },
  { id: "funazushi", name: "鮒ずし", sprite: "funazushi", cost: 1, base: 2, grow: 1, rot: 3, play: [{ atk: "v" }], rotPlay: [{ atk: 5, times: 2 }], text: "腐ると 攻5を2回" },
  { id: "kusaya", name: "くさや", sprite: "kusaya", cost: 1, base: 1, grow: 1, rot: 2, play: [{ atk: "v" }], rotPlay: [{ poisonPerRotten: 3 }], text: "腐ると 腐った札1枚ごとに毒3" },
  { id: "shottsuru", name: "魚醤", sprite: "shottsuru", cost: 1, base: 2, grow: 2, rot: 3, play: [{ def: "v" }], rotPlay: [{ def: 8 }, { poison: 2 }], text: "腐ると 守8 毒2" },
  { id: "tougarashi", name: "唐辛子", sprite: "tougarashi", cost: 1, base: 2, grow: 2, rot: 4, play: [{ atk: "v" }], rotPlay: [{ atk: 4 }, { weaken: 2 }], text: "腐ると 攻4 敵の力−2" },
  { id: "aokabi", name: "青カビ", sprite: "aokabi", cost: 0, base: 2, grow: 0, rot: 1, play: [{ def: "v" }], rotPlay: [{ heal: 4 }, { draw: 1 }], text: "腐ると 回復4 1枚引く" },
  // ---- 型の専用札（2026-11-16。どの型に入るかは data/decks.js） ----
  // 浅漬け速攻
  { id: "ichiyazuke", name: "一夜漬け", sprite: "ichiyazuke", cost: 0, base: 2, grow: 2, rot: 2, play: [{ atk: "v" }], rotPlay: null, text: "気力0。一晩で育つ" },
  { id: "sokuseki", name: "即席漬け", sprite: "sokuseki", cost: 1, base: 3, grow: 3, rot: 2, play: [{ atk: "v" }, { draw: 1 }], rotPlay: null, text: "攻撃して1枚引く。すぐ腐る" },
  { id: "ippon", name: "一本漬け", sprite: "ippon", cost: 1, base: 2, grow: 2, rot: 3, play: [{ atk: "v", times: 2 }], rotPlay: null, text: "2回攻撃" },
  { id: "shiomomi", name: "塩もみ", sprite: "shiomomi", cost: 0, base: 0, grow: 0, rot: null, play: [{ ageOthers: 1 }, { draw: 1 }], rotPlay: null, text: "他の手札を1段漬けて1枚引く" },
  { id: "senmai", name: "千枚漬け", sprite: "senmai", cost: 2, base: 2, grow: 1, rot: 4, play: [{ atk: "v", times: 3 }], rotPlay: null, text: "3回攻撃" },
  // 古漬け大技
  { id: "takuan", name: "たくあん", sprite: "takuan", cost: 2, base: 3, grow: 5, rot: 7, play: [{ atk: "v" }], rotPlay: null, text: "島の名物。寝かせるほど大技" },
  { id: "bettara", name: "べったら", sprite: "bettara", cost: 1, base: 3, grow: 2, rot: 6, play: [{ def: "v" }], rotPlay: null, text: "守り。長く漬けられる" },
  { id: "yamagobo", name: "山ごぼう", sprite: "yamagobo", cost: 1, base: 1, grow: 2, rot: 7, play: [{ atk: "v" }], rotPlay: null, text: "安く、とても長く漬けられる" },
  { id: "iburi", name: "いぶり漬け", sprite: "iburi", cost: 2, base: 4, grow: 3, rot: 6, play: [{ atk: "v" }, { weaken: 1 }], rotPlay: null, text: "攻撃して敵の力−1" },
  // 発酵
  { id: "shiokara", name: "塩辛", sprite: "shiokara", cost: 1, base: 2, grow: 1, rot: 2, play: [{ def: "v" }], rotPlay: [{ def: 4 }, { poisonPerRotten: 2 }], text: "腐ると 守4 腐った札1枚ごとに毒2" },
  { id: "kuroninniku", name: "黒にんにく", sprite: "kuroninniku", cost: 1, base: 1, grow: 1, rot: 2, play: [{ atk: "v" }], rotPlay: [{ atk: 4 }, { heal: 3 }], text: "腐ると 攻4 回復3" },
  // 梅の守り
  { id: "umeboshi", name: "梅干し", sprite: "umeboshi", cost: 1, base: 3, grow: 1, rot: null, play: [{ def: "v" }], rotPlay: null, text: "守り。腐らない" },
  { id: "karikari", name: "カリカリ梅", sprite: "karikari", cost: 0, base: 2, grow: 0, rot: null, play: [{ atk: "v" }], rotPlay: null, text: "気力0の攻2。育たず腐らない" },
  { id: "umeshu", name: "梅酒", sprite: "umeshu", cost: 1, base: 0, grow: 0, rot: null, play: [{ heal: 3 }, { draw: 1 }], rotPlay: null, text: "回復3。1枚引く" },
  { id: "shisomaki", name: "しそ巻き", sprite: "shisomaki", cost: 1, base: 2, grow: 1, rot: null, play: [{ def: "v" }, { weaken: 1 }], rotPlay: null, text: "守って敵の力−1" },
  { id: "tane", name: "種飛ばし", sprite: "tane", cost: 1, base: 0, grow: 0, rot: null, play: [{ atkPerBlock: 1 }], rotPlay: null, text: "今の守りの分だけ攻撃" },
  // ---- 新しい型（2026-11-16） ----
  // 糠床の毒：毎番少しずつ削る
  { id: "nukamiso", name: "糠味噌", sprite: "nukamiso", cost: 1, base: 0, grow: 1, rot: 3, play: [{ poison: "v" }], rotPlay: null, text: "毒。寝かせるほど濃い" },
  { id: "nukazuke", name: "糠漬け", sprite: "nukazuke", cost: 1, base: 1, grow: 1, rot: 4, play: [{ atk: "v" }, { poison: 1 }], rotPlay: null, text: "攻撃して毒1" },
  { id: "nukadama", name: "糠玉", sprite: "nukadama", cost: 0, base: 0, grow: 0, rot: 2, play: [{ poison: 1 }], rotPlay: null, text: "気力0で毒1。すぐ腐る" },
  { id: "furunuka", name: "古糠", sprite: "furunuka", cost: 2, base: 0, grow: 0, rot: null, play: [{ poison: 5 }], rotPlay: null, text: "毒5" },
  { id: "nukauchi", name: "糠の一撃", sprite: "nukauchi", cost: 1, base: 0, grow: 0, rot: null, play: [{ atkPerPoison: 1 }], rotPlay: null, text: "敵の毒の分だけ攻撃" },
  { id: "iriko", name: "いりこ", sprite: "iriko", cost: 1, base: 2, grow: 1, rot: 5, play: [{ def: "v" }, { poison: 1 }], rotPlay: null, text: "守って毒1" },
  { id: "karashinuka", name: "辛子糠", sprite: "karashinuka", cost: 1, base: 0, grow: 0, rot: null, play: [{ poison: 2 }, { weaken: 1 }], rotPlay: null, text: "毒2。敵の力−1" },
  // 盛り合わせ：1つの番に何枚も使って連ねる
  { id: "moriawase", name: "盛り合わせ", sprite: "moriawase", cost: 1, base: 0, grow: 0, rot: null, play: [{ atkPerPlayed: 2 }], rotPlay: null, text: "この番に先に使った札1枚ごとに攻2" },
  { id: "osechi", name: "おせち", sprite: "osechi", cost: 2, base: 0, grow: 0, rot: null, play: [{ atkPerPlayed: 3 }], rotPlay: null, text: "この番に先に使った札1枚ごとに攻3" },
  { id: "kozara", name: "小皿", sprite: "kozara", cost: 0, base: 0, grow: 1, rot: 4, play: [{ atk: "v" }], rotPlay: null, text: "気力0の小攻撃" },
  { id: "tsumami", name: "おつまみ", sprite: "tsumami", cost: 0, base: 1, grow: 0, rot: null, play: [{ atk: 1, times: 2 }], rotPlay: null, text: "気力0。攻1を2回" },
  { id: "hashiyasume", name: "箸休め", sprite: "hashiyasume", cost: 0, base: 1, grow: 1, rot: 4, play: [{ def: "v" }], rotPlay: null, text: "気力0の守り" },
  { id: "ochazuke", name: "お茶漬け", sprite: "ochazuke", cost: 1, base: 0, grow: 0, rot: null, play: [{ energy: 1 }, { draw: 1 }], rotPlay: null, text: "気力が戻り、1枚引く" },
  { id: "teishoku", name: "定食", sprite: "teishoku", cost: 2, base: 3, grow: 1, rot: 5, play: [{ atk: "v" }, { def: "v" }, { draw: 1 }], rotPlay: null, text: "攻撃と守り。1枚引く" },
  // 相手を漬ける：敵を漬けて、当たるたびの痛手を増やす
  { id: "shiotsubo", name: "塩壺", sprite: "shiotsubo", cost: 1, base: 0, grow: 0, rot: null, play: [{ brine: 1 }], rotPlay: null, text: "敵を1段漬ける（当たるたび+1）" },
  { id: "dobuzuke", name: "どぶ漬け", sprite: "dobuzuke", cost: 2, base: 0, grow: 0, rot: null, play: [{ brine: 3 }], rotPlay: null, text: "敵を3段漬ける" },
  { id: "tsukejiru", name: "漬けだれ", sprite: "tsukejiru", cost: 1, base: 2, grow: 1, rot: 4, play: [{ atk: "v" }, { brine: 1 }], rotPlay: null, text: "攻撃して敵を1段漬ける" },
  { id: "tsukebari", name: "漬け針", sprite: "tsukebari", cost: 1, base: 1, grow: 0, rot: null, play: [{ atk: 1, times: 3 }], rotPlay: null, text: "攻1を3回。漬けた敵に効く" },
  { id: "amazu", name: "甘酢", sprite: "amazu", cost: 1, base: 0, grow: 0, rot: null, play: [{ def: 4 }, { brine: 1 }], rotPlay: null, text: "守4。敵を1段漬ける" },
  { id: "shiokoji", name: "塩麹", sprite: "shiokoji", cost: 1, base: 0, grow: 0, rot: null, play: [{ brine: 1 }, { draw: 1 }], rotPlay: null, text: "敵を1段漬けて1枚引く" },
  { id: "kasuzuke", name: "粕漬け", sprite: "kasuzuke", cost: 2, base: 3, grow: 2, rot: 5, play: [{ atk: "v" }, { brine: 1 }], rotPlay: null, text: "攻撃して敵を1段漬ける" },
  { id: "hishio", name: "ひしお", sprite: "hishio", cost: 1, base: 0, grow: 0, rot: null, play: [{ healPerRotten: 2 }, { defPerRotten: 2 }], rotPlay: null, text: "腐った札1枚ごとに回復2 守2" },
  // ---- できごとで入る厄介な札（もらえる札には出ない） ----
  { id: "kusare", name: "腐れ札", sprite: "kusare", cost: 0, base: 0, grow: 0, rot: 1, play: [], rotPlay: null, text: "使えない。すぐ腐り、堆肥にするしかない" },
  // ---- 解放される札（data/unlocks.js。0.8.0） ----
  { id: "misozuke", name: "味噌漬け", sprite: "misozuke", cost: 1, base: 2, grow: 1, rot: null, play: [{ def: "v" }], rotPlay: null, text: "守り。腐らずに育つ" },
  { id: "hoshigaki", name: "干し柿", sprite: "hoshigaki", cost: 1, base: 0, grow: 0, rot: null, play: [{ heal: 3 }, { draw: 1 }], rotPlay: null, text: "回復3。1枚引く" },
  { id: "shibazuke", name: "しば漬け", sprite: "shibazuke", cost: 1, base: 1, grow: 2, rot: 3, play: [{ atk: "v" }, { brine: 1 }], rotPlay: null, text: "攻撃して敵を漬ける" },
  { id: "kimuchi", name: "キムチ", sprite: "kimuchi", cost: 1, base: 2, grow: 2, rot: 2, play: [{ atk: "v" }], rotPlay: [{ atk: 5 }, { poison: 2 }], text: "腐ると 攻5 毒2" },
];
