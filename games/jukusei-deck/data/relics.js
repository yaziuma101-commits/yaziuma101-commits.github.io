// 樽の道具：持っているだけで効く。宝・精鋭・親分・店で手に入る。1行足すだけで増える。
// 効き目（fx）の種類。章の土地の決まり（run.js の chapters[].land.fx）も同じ種類を使う。
//   block 戦いの始めに守り / blockTurn 毎番の始めに守り / energyFirst 最初の番の気力+ / freezeFirst 最初の番は漬からない
//   poison 戦いの始めに敵へ毒 / brine 戦いの始めに敵を漬ける / weaken 戦いの始めに敵の力−（0まで）
//   rotPlus 札の腐る段+（腐る札だけ） / maxHp 最大体力+（手に入れたとき） / goldWin 勝つとお金+ / healWin 勝つと体力+
//   potionSlot 漬け汁を持てる数+ / moldEvery N番ごとに手札が1段漬かる / saltEvery N番ごとに一番古い札が1段戻る
// rare: 宝と親分からだけ出る
export default [
  { id: "omoshidaru", name: "重石の樽", sprite: "r_omoshi", text: "最初の番は手札が漬からない", fx: { freezeFirst: 1 } },
  { id: "furudaru", name: "古い樽", sprite: "r_furudaru", text: "札の腐る段+1", fx: { rotPlus: 1 }, rare: true },
  { id: "urushi", name: "漆の樽", sprite: "r_urushi", text: "戦いの始めに守り4", fx: { block: 4 } },
  { id: "shiogame", name: "塩の甕", sprite: "r_shiogame", text: "戦いの始めに敵を漬ける1", fx: { brine: 1 }, rare: true },
  { id: "nukagame", name: "糠の甕", sprite: "r_nukagame", text: "戦いの始めに敵に毒3", fx: { poison: 3 } },
  { id: "maneki", name: "招き猫", sprite: "r_maneki", text: "勝つとお金+10", fx: { goldWin: 10 } },
  { id: "kusuri", name: "薬箱", sprite: "r_kusuri", text: "勝つと体力+3", fx: { healWin: 3 } },
  { id: "tarai", name: "大盥", sprite: "r_tarai", text: "最大体力+6", fx: { maxHp: 6 } },
  { id: "hashi", name: "竹の箸", sprite: "r_hashi", text: "毎番の始めに守り1", fx: { blockTurn: 1 } },
  { id: "nabe", name: "鉄鍋", sprite: "r_nabe", text: "最初の番の気力+1", fx: { energyFirst: 1 } },
  { id: "futa", name: "樽の蓋", sprite: "r_futa", text: "漬け汁を1つ多く持てる", fx: { potionSlot: 1 } },
  { id: "tenugui", name: "手ぬぐい", sprite: "r_tenugui", text: "戦いの始めに敵の力-1", fx: { weaken: 1 } },
  // ---- 解放される道具（data/unlocks.js。0.8.0） ----
  { id: "sunoko", name: "簀の子", sprite: "r_sunoko", text: "戦いの始めに守り3・毎番守り1", fx: { block: 3, blockTurn: 1 } },
  { id: "kamidana", name: "神棚", sprite: "r_kamidana", text: "勝つと体力+5", fx: { healWin: 5 }, rare: true },
];
