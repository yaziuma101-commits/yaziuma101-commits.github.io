// アイテムの定義と「アイテム × ゲーム」の効果表（three.js・DOM に依存しない）。
// 今後のゲームは ITEMS に1行、EFFECT_TABLE に行を足すだけで仕組みに乗る。
import { pick, pickWeighted } from './seeded-rng.js';
import { GAME_CATALOG } from './game-catalog.js';

const f = Object.freeze;

export const ITEMS = f([
  f({ id: 'movebox', name: '動く箱', fromGame: 'puzzle' }),
  f({ id: 'turbokart', name: 'ターボカート', fromGame: 'race' }),
  f({ id: 'watergun', name: '水鉄砲', fromGame: 'fps' }),
  f({ id: 'dekamohawk', name: 'デカモヒカン', fromGame: 'mohi-touch' }),
  f({ id: 'agemohawk', name: '揚げモヒカン', fromGame: 'blowaway' }),
  f({ id: 'nasukoma', name: 'ナス駒', fromGame: 'super-shogi' }),
  f({ id: 'fushigikendama', name: 'ふしぎなけん玉', fromGame: 'kendama' }),
  f({ id: 'shiori', name: 'しおり', fromGame: 'novel-chicken' }),
  f({ id: 'floppy', name: 'フロッピーディスク', fromGame: 'find-file' }),
  f({ id: 'hachimaki', name: '必勝ハチマキ', fromGame: 'lever-fighter' }),
  f({ id: 'old-lantern', name: '古いランタン', fromGame: 'dark-soul' }),
  f({ id: 'sofubi-kaiju', name: 'ソフビ怪獣', fromGame: 'kaiju' }),
]);

/** 既存ボスの id → ゲームID（境界での対応づけ） */
export const BOSS_GAME_IDS = f({ puzzle: 'puzzle', race: 'race', fps: 'fps' });

export function gameIdForBoss(bossId) {
  return typeof bossId === 'string' && Object.prototype.hasOwnProperty.call(BOSS_GAME_IDS, bossId)
    ? BOSS_GAME_IDS[bossId] : null;
}

export function itemById(id, items = ITEMS) {
  return items.find((i) => i.id === id);
}

const fx = (id, tag, label, params, weight) => f(weight === undefined
  ? { id, tag, label, params: f(params) }
  : { id, tag, label, params: f(params), weight });

export const EFFECT_TABLE = f([
  f({
    item: 'watergun', game: 'race', mode: 'fixed',
    effects: f([
      fx('rival-slow', 'good', '相手のカートを撃って減速', { rivalSpeedMul: 0.7, rivalSlowSec: 3 }),
      fx('screen-drops', 'bad', '画面に水滴がついて見にくい', { screenDrops: true }),
    ]),
  }),
  f({
    item: 'turbokart', game: 'puzzle', mode: 'fixed',
    effects: f([fx('push-two', 'mixed', '箱を2マス押せる（止まらない）', { pushDistance: 2 })]),
  }),
  f({
    item: 'movebox', game: 'fps', mode: 'random',
    effects: f([
      fx('boxes-shield', 'good', '箱が番長の視線をさえぎる', { coverBoxesRoam: 'toward-enemy' }, 1),
      fx('boxes-wander', 'bad', '箱が目の前に寄ってくる', { coverBoxesRoam: 'toward-player' }, 1),
    ]),
  }),
  // ---- モヒカンタッチタッチ（createFighter の mods。rival〇〇 は相手の mods） ----
  f({
    item: 'dekamohawk', game: 'mohi-touch', mode: 'random',
    effects: f([
      fx('big-reach', 'good', 'デカいモヒカンの勢いで手が長くなる', { reachBonus: 0.3 }, 1),
      fx('big-target', 'bad', 'デカいモヒカンが触られやすい', { hitScale: 1.4 }, 1),
    ]),
  }),
  f({
    item: 'agemohawk', game: 'mohi-touch', mode: 'fixed',
    effects: f([fx('slippery-hand', 'mixed', '手が滑って伸びが速いが外れやすい', { reachSeconds: 0.25, accuracy: 0.7 })]),
  }),
  f({
    item: 'movebox', game: 'mohi-touch', mode: 'fixed',
    effects: f([fx('box-hide', 'good', '箱に隠れてモヒカンが小さく見える', { hitScale: 0.8 })]),
  }),
  f({
    item: 'turbokart', game: 'mohi-touch', mode: 'fixed',
    effects: f([fx('turbo-hand', 'good', 'ターボで手が速く伸びる', { reachSeconds: 0.28 })]),
  }),
  f({
    item: 'watergun', game: 'mohi-touch', mode: 'fixed',
    effects: f([fx('splash-eyes', 'good', '相手の目に水をかけて手元が狂う', { rivalAccuracy: 0.8 })]),
  }),
  // ---- 積み上げたもの吹っ飛ばし ----
  f({
    item: 'dekamohawk', game: 'blowaway', mode: 'fixed',
    effects: f([fx('big-base', 'good', '最初のブロックが大きい', { baseWidth: 5.5 })]),
  }),
  f({
    item: 'agemohawk', game: 'blowaway', mode: 'fixed',
    effects: f([fx('pot-lure', 'good', '油の鍋がモヒカンを呼び寄せる（鍋が広い）', { potWidthBonus: 2 })]),
  }),
  f({
    item: 'movebox', game: 'blowaway', mode: 'fixed',
    effects: f([fx('box-wobble', 'bad', '箱につられてブロックの揺れが速い', { swingMult: 1.3 })]),
  }),
  f({
    item: 'turbokart', game: 'blowaway', mode: 'fixed',
    effects: f([fx('turbo-swing', 'good', 'ターボで振りが強くなる', { powerBonus: 0.1 })]),
  }),
  f({
    item: 'watergun', game: 'blowaway', mode: 'random',
    effects: f([
      fx('water-jet', 'good', '水の勢いでパワーアップ', { powerBonus: 0.15 }, 1),
      fx('water-slip', 'bad', '手が濡れて積む時間が短い', { timeLimit: 15 }, 1),
    ]),
  }),
  // ---- ナス駒（スーパー将棋の初勝利で獲得）を既存のゲームへ ----
  f({
    item: 'nasukoma', game: 'puzzle', mode: 'fixed',
    effects: f([fx('nasu-hop', 'mixed', 'ナス駒の跳ね方で箱が2マス進む（止まらない）', { pushDistance: 2 })]),
  }),
  f({
    item: 'nasukoma', game: 'race', mode: 'fixed',
    effects: f([fx('nasu-juice', 'bad', 'ナスの汁が画面について見にくい', { screenDrops: true })]),
  }),
  f({
    item: 'nasukoma', game: 'fps', mode: 'random',
    effects: f([
      fx('nasu-shield', 'good', 'ナス駒に呼ばれて箱が番長の視線をさえぎる', { coverBoxesRoam: 'toward-enemy' }, 1),
      fx('nasu-crowd', 'bad', 'ナス駒につられて箱が目の前に寄ってくる', { coverBoxesRoam: 'toward-player' }, 1),
    ]),
  }),
  f({
    item: 'nasukoma', game: 'mohi-touch', mode: 'random',
    effects: f([
      fx('nasu-distract', 'good', '相手がナス駒に気を取られて手元が狂う', { rivalAccuracy: 0.75 }, 1),
      fx('nasu-bulge', 'bad', 'ナス駒がモヒカンに刺さって触られやすい', { hitScale: 1.3 }, 1),
    ]),
  }),
  f({
    item: 'nasukoma', game: 'blowaway', mode: 'fixed',
    effects: f([fx('nasu-weight', 'good', 'ナス駒を重しにして振りが強くなる', { powerBonus: 0.12 })]),
  }),
  // ---- スーパー将棋（params.shogiCarry の効果は shogi-carry.js の表で決まる） ----
  f({
    item: 'movebox', game: 'super-shogi', mode: 'fixed',
    effects: f([fx('box-pawns', 'good', '箱から歩が2枚出てきた（持ち駒に歩+2）', { shogiCarry: 'movebox' })]),
  }),
  f({
    item: 'turbokart', game: 'super-shogi', mode: 'fixed',
    effects: f([fx('turbo-rush', 'good', 'ターボで急かされ、おなすくんの最初の3手が浅くなる', { shogiCarry: 'turbokart' })]),
  }),
  f({
    item: 'watergun', game: 'super-shogi', mode: 'fixed',
    effects: f([fx('wash-away', 'good', '水鉄砲で相手の駒を1つ盤外へ押し流せる（1回）', { shogiCarry: 'watergun' })]),
  }),
  f({
    item: 'dekamohawk', game: 'super-shogi', mode: 'fixed',
    effects: f([fx('more-matta', 'good', 'デカモヒカンの貫禄で「待った」が5回', { shogiCarry: 'dekamohawk' })]),
  }),
  f({
    item: 'agemohawk', game: 'super-shogi', mode: 'random',
    effects: f([
      fx('gold-mine', 'good', '油で金がこちらに滑ってきた（持ち駒に金）', { shogiCarry: 'agemohawk', goldTo: 'b' }, 1),
      fx('gold-rival', 'bad', '油で金がおなすくんへ滑っていった（相手の持ち駒に金）', { shogiCarry: 'agemohawk', goldTo: 'w' }, 1),
    ]),
  }),
  f({
    item: 'nasukoma', game: 'super-shogi', mode: 'fixed',
    effects: f([fx('extra-custom', 'good', 'ナス駒が加勢：自作駒がもう1枚', { shogiCarry: 'nasukoma' })]),
  }),
  // ---- けん玉ケンケン（kendamaItemOptions で読む） ----
  f({
    item: 'movebox', game: 'kendama', mode: 'fixed',
    effects: f([fx('kd-drift', 'bad', '箱につられて手が左右にゆっくり流される', { handDrift: 0.1 })]),
  }),
  f({
    item: 'turbokart', game: 'kendama', mode: 'fixed',
    effects: f([fx('kd-turbo-charge', 'bad', '溜めゲージが1.5倍速で溜まる', { chargeRate: 1.5 })]),
  }),
  f({
    item: 'watergun', game: 'kendama', mode: 'fixed',
    effects: f([fx('kd-wet', 'bad', '玉が濡れて滑る（受けにくい）', { windowScale: 0.8 })]),
  }),
  f({
    item: 'dekamohawk', game: 'kendama', mode: 'fixed',
    effects: f([fx('kd-big-ball', 'good', '玉が大きくなって受けやすい', { windowScale: 1.25 })]),
  }),
  f({
    item: 'agemohawk', game: 'kendama', mode: 'random',
    effects: f([
      fx('kd-crispy', 'good', '衣がひっかかって受けやすい', { windowScale: 1.4 }, 1),
      fx('kd-oily', 'bad', '油でつるつる滑る', { windowScale: 0.7 }, 1),
    ]),
  }),
  f({
    item: 'nasukoma', game: 'kendama', mode: 'fixed',
    effects: f([fx('kd-nasu-tip', 'good', 'けん先がナスのように刺さりやすい', { kensakiScale: 1.5 })]),
  }),
  f({
    item: 'fushigikendama', game: 'kendama', mode: 'fixed',
    effects: f([fx('kd-magic', 'good', 'ふしぎな力で全部の皿が受けやすい', { windowScale: 1.3 })]),
  }),
  f({
    item: 'shiori', game: 'kendama', mode: 'fixed',
    effects: f([fx('kd-guide', 'good', '溜めゲージに目安線が出る', { chargeGuide: true })]),
  }),
  // ---- 新2アイテムを既存6ゲームへ（phase4CarryOptions で読む） ----
  f({
    item: 'fushigikendama', game: 'puzzle', mode: 'random',
    effects: f([
      fx('kd-miss-free', 'good', 'ふしぎな力で、1回だけ箱を手前に引ける（Xキー）', { missFree: 1 }, 1),
      fx('kd-first-slip', 'bad', '玉に引っぱられて最初の1手がずれる', { firstMoveSlip: true }, 1),
    ]),
  }),
  f({
    item: 'shiori', game: 'puzzle', mode: 'fixed',
    effects: f([fx('sh-undo', 'good', 'しおりのひもで、1回だけ箱を手前に引ける（Xキー）', { undoOnce: true })]),
  }),
  f({
    item: 'fushigikendama', game: 'race', mode: 'fixed',
    effects: f([fx('kd-steer-lag', 'bad', 'ハンドルが振り子のように少し遅れて効く', { steerLag: 0.15 })]),
  }),
  f({
    item: 'shiori', game: 'race', mode: 'fixed',
    effects: f([fx('sh-respawn', 'good', 'カートから追い出されても、1回だけすぐ戻れる', { respawnOnce: true })]),
  }),
  f({
    item: 'fushigikendama', game: 'fps', mode: 'fixed',
    effects: f([fx('kd-damage', 'good', '弾のダメージが20%上がる', { damageMul: 1.2 })]),
  }),
  f({
    item: 'shiori', game: 'fps', mode: 'random',
    effects: f([
      fx('sh-heart', 'good', 'しおりに挟んだハートで体力+1', { heartBonus: 1 }, 1),
      fx('sh-slow-reload', 'bad', 'しおりを探してリロードが1.5倍遅い', { reloadMul: 1.5 }, 1),
    ]),
  }),
  f({
    item: 'fushigikendama', game: 'mohi-touch', mode: 'fixed',
    effects: f([fx('kd-chain', 'good', '玉の連鎖で1タッチが2回数えられる', { touchDouble: true, reachBonus: 0.15 })]),
  }),
  f({
    item: 'shiori', game: 'mohi-touch', mode: 'fixed',
    effects: f([fx('sh-forgive', 'good', '1回だけ、触られても帳消しになる', { forgiveOnce: true })]),
  }),
  f({
    item: 'fushigikendama', game: 'blowaway', mode: 'fixed',
    effects: f([fx('kd-sway', 'bad', '吹っ飛ぶ向きが振り子のようにぶれる', { swingMult: 1.25 })]),
  }),
  f({
    item: 'shiori', game: 'blowaway', mode: 'fixed',
    effects: f([fx('sh-retry', 'good', '弱すぎた振りを1回だけ打ち直せる', { retryOnce: true, powerBonus: 0.05 })]),
  }),
  f({
    item: 'fushigikendama', game: 'super-shogi', mode: 'random',
    effects: f([
      fx('kd-swap', 'bad', 'ふしぎな力で先手と後手が入れ替わる', { swapSides: true }, 1),
      fx('kd-extra-piece', 'good', 'ふしぎな力で駒が1枚増える', { shogiCarry: 'nasukoma' }, 1),
    ]),
  }),
  f({
    item: 'shiori', game: 'super-shogi', mode: 'fixed',
    effects: f([fx('sh-matta', 'good', 'しおりで1手だけ待ったができる', { extraMatta: 1 })]),
  }),
  // ---- 小説一夜漬けチキンレース（novelItemOptions で読む） ----
  f({
    item: 'movebox', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('nv-shake', 'bad', '文字が小刻みに揺れる', { textShake: true })]),
  }),
  f({
    item: 'turbokart', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('nv-turbo', 'bad', 'ページが速くめくれる（1ページ0.9秒）', { pageSpeed: 1.33 })]),
  }),
  f({
    item: 'watergun', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('nv-splash', 'good', 'タバコヌスの早押しが1秒遅れる', { aiDelay: 1.0 })]),
  }),
  f({
    item: 'dekamohawk', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('nv-big-text', 'good', '文字が1.2倍の大きさになる', { fontScale: 1.2 })]),
  }),
  f({
    item: 'agemohawk', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('nv-age-speed', 'mixed', 'めくる速さが毎問変わる（×0.8か×1.5）', { pageSpeedRandom: true })]),
  }),
  f({
    item: 'nasukoma', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('nv-eliminate', 'good', '1回だけ誤答を1つ消せる（Eキー）', { eliminateOne: true })]),
  }),
  f({
    item: 'fushigikendama', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('nv-score-dice', 'mixed', '各問の得点が×0.5／×1／×2になる', { scoreRandom: true })]),
  }),
  f({
    item: 'shiori', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('nv-bookmark', 'good', 'Bで1回だけ2ページ前に戻り3秒止まる', { bookmark: true })]),
  }),
  // ---- フロッピーディスク（ファイルを見つけろの初勝利で獲得）を既存8ゲームへ（既存の効果キーを使う） ----
  f({
    item: 'floppy', game: 'puzzle', mode: 'fixed',
    effects: f([fx('fd-undo', 'good', 'フロッピーの記録をたどって、1回だけ箱を手前に引ける（Xキー）', { undoOnce: true })]),
  }),
  f({
    item: 'floppy', game: 'race', mode: 'fixed',
    effects: f([fx('fd-respawn', 'good', 'セーブデータを読み込んで、カートから追い出されても1回だけすぐ戻れる', { respawnOnce: true })]),
  }),
  f({
    item: 'floppy', game: 'fps', mode: 'random',
    effects: f([
      fx('fd-heart', 'good', 'フロッピーに保存した体力で体力+1', { heartBonus: 1 }, 1),
      fx('fd-slow-reload', 'bad', 'フロッピーの読み込み待ちでリロードが遅い', { reloadMul: 1.3 }, 1),
    ]),
  }),
  f({
    item: 'floppy', game: 'mohi-touch', mode: 'fixed',
    effects: f([fx('fd-forgive', 'good', 'セーブしたところから、1回だけ触られても帳消しになる', { forgiveOnce: true })]),
  }),
  f({
    item: 'floppy', game: 'blowaway', mode: 'fixed',
    effects: f([fx('fd-retry', 'good', 'セーブから読み込んで、弱すぎた振りを1回だけ打ち直せる', { retryOnce: true })]),
  }),
  f({
    item: 'floppy', game: 'super-shogi', mode: 'fixed',
    effects: f([fx('fd-matta', 'good', '棋譜をフロッピーに保存してあるので待ったが1回増える', { extraMatta: 1 })]),
  }),
  f({
    item: 'floppy', game: 'kendama', mode: 'fixed',
    effects: f([fx('fd-guide', 'good', 'フロッピーのラベルが溜めゲージの目安線になる', { chargeGuide: true })]),
  }),
  f({
    item: 'floppy', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('fd-loading', 'good', 'タバコヌスがフロッピーを読み込む間、早押しが0.5秒遅れる', { aiDelay: 0.5 })]),
  }),
  // ---- 既存8アイテムとフロッピーをファイルを見つけろへ（findFileItemOptions で読む） ----
  f({
    item: 'movebox', game: 'find-file', mode: 'fixed',
    effects: f([fx('ff-confirm', 'mixed', '提出の前に箱が「本当にこれ？」と確かめてくれる（その間も時間は進む）', { confirmSubmit: true })]),
  }),
  f({
    item: 'turbokart', game: 'find-file', mode: 'fixed',
    effects: f([fx('ff-turbo-click', 'bad', 'ダブルクリックの判定が速すぎて開きにくい（Enter なら開ける）', { doubleClickMs: 200 })]),
  }),
  f({
    item: 'watergun', game: 'find-file', mode: 'fixed',
    effects: f([fx('ff-splash', 'good', 'とうふアリヌスのノートパソコンに水がかかって探すのが遅れる', { aiDelayMul: 1.2 })]),
  }),
  f({
    item: 'dekamohawk', game: 'find-file', mode: 'fixed',
    effects: f([fx('ff-highlight', 'good', 'デカいモヒカンが指して、手がかりの大事なところが目立つ', { clueHighlight: true })]),
  }),
  f({
    item: 'agemohawk', game: 'find-file', mode: 'fixed',
    effects: f([fx('ff-oil-wait', 'good', '油でつるっと立ち直りが早く、外れの待ちが6秒になる', { penaltySec: 6 })]),
  }),
  f({
    item: 'nasukoma', game: 'find-file', mode: 'fixed',
    effects: f([fx('ff-no-decoy', 'good', 'ナス駒がおとりのファイルを1つ食べてしまう', { removeDecoys: 1 })]),
  }),
  f({
    item: 'fushigikendama', game: 'find-file', mode: 'fixed',
    effects: f([fx('ff-score', 'good', 'ふしぎな力で正解の点が1.1倍', { scoreMul: 1.1 })]),
  }),
  f({
    item: 'shiori', game: 'find-file', mode: 'fixed',
    effects: f([fx('ff-bookmark', 'good', 'しおり（Bキー）で1回だけ直前に開いたフォルダへ戻れる', { bookmark: 1 })]),
  }),
  f({
    item: 'floppy', game: 'find-file', mode: 'fixed',
    effects: f([fx('ff-floppy', 'good', 'フロッピーのメモで手がかりが目立ち、外れの待ちが8秒になる', { clueHighlight: true, penaltySec: 8 })]),
  }),
  // ---- 必勝ハチマキ（レバガチャファイターヌスの初勝利で獲得）を既存9ゲームへ（既存の効果キーを使う） ----
  f({
    item: 'hachimaki', game: 'puzzle', mode: 'fixed',
    effects: f([fx('hm-undo', 'good', '必勝ハチマキの怪力で、1回だけ箱を手前に引ける（Xキー）', { undoOnce: true })]),
  }),
  f({
    item: 'hachimaki', game: 'race', mode: 'fixed',
    effects: f([fx('hm-respawn', 'good', '必勝ハチマキの気合で、カートから追い出されても1回だけすぐ戻れる', { respawnOnce: true })]),
  }),
  f({
    item: 'hachimaki', game: 'fps', mode: 'fixed',
    effects: f([fx('hm-heart', 'good', '必勝ハチマキの気合で体力+1', { heartBonus: 1 })]),
  }),
  f({
    item: 'hachimaki', game: 'mohi-touch', mode: 'fixed',
    effects: f([fx('hm-reach', 'good', '気合で手が少し長く伸びる', { reachBonus: 0.2 })]),
  }),
  f({
    item: 'hachimaki', game: 'blowaway', mode: 'fixed',
    effects: f([fx('hm-power', 'good', '必勝ハチマキの気合で振りが強くなる', { powerBonus: 0.1 })]),
  }),
  f({
    item: 'hachimaki', game: 'super-shogi', mode: 'fixed',
    effects: f([fx('hm-matta', 'good', '集中して、待ったが1回増える', { extraMatta: 1 })]),
  }),
  f({
    item: 'hachimaki', game: 'kendama', mode: 'fixed',
    effects: f([fx('hm-focus-kd', 'good', '集中して、全部の皿が少し受けやすい', { windowScale: 1.15 })]),
  }),
  f({
    item: 'hachimaki', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('hm-focus-nv', 'good', '気迫に押されて、タバコヌスの早押しが0.7秒遅れる', { aiDelay: 0.7 })]),
  }),
  f({
    item: 'hachimaki', game: 'find-file', mode: 'fixed',
    effects: f([fx('hm-focus-ff', 'good', '集中して立ち直りが早く、外れの待ちが7秒になる', { penaltySec: 7 })]),
  }),
  // ---- 既存9アイテムと必勝ハチマキをレバガチャファイターヌスへ（lf-item-fx.js の lfCarryEffects で読む） ----
  f({
    item: 'movebox', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('lf-box', 'good', '箱を押して鍛えた体で、最大体力+15', { lfItem: 'movebox', extraHp: 15 })]),
  }),
  f({
    item: 'turbokart', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('lf-turbo', 'good', 'ターボの勢いで、1ラウンドの制限時間+15秒', { lfItem: 'turbokart', extraTime: 15 })]),
  }),
  f({
    item: 'watergun', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('lf-clear', 'good', '水で目が冴え、気合のゲージが2倍光る', { lfItem: 'watergun', hintBoost: 2 })]),
  }),
  f({
    item: 'dekamohawk', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('lf-calm', 'good', 'デカモヒカンの落ち着きで、コマンドの入力猶予が0.8秒になる', { lfItem: 'dekamohawk', windowBonus: 0.2 })]),
  }),
  f({
    item: 'agemohawk', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('lf-slip', 'mixed', '油で手が滑り、たまに必殺技が暴発する', { lfItem: 'agemohawk', misfireRate: 0.08 })]),
  }),
  f({
    item: 'nasukoma', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('lf-nasu', 'good', 'ムキムキヌスがナス駒に気を取られ、相手の最大体力-10', { lfItem: 'nasukoma', foeHpMinus: 10 })]),
  }),
  f({
    item: 'fushigikendama', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('lf-sense', 'good', 'ふしぎな力で、どれか1つの必殺技のコマンドが最初から分かる', { lfItem: 'fushigikendama', revealRandom: true })]),
  }),
  f({
    item: 'shiori', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('lf-bookmark', 'good', 'しおりのメモで、1つ目の必殺技（モヒカン波動）のコマンドが最初から分かる', { lfItem: 'shiori', revealFirst: true })]),
  }),
  f({
    item: 'floppy', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('lf-save', 'good', '見つけたコマンドをフロッピーに保存し、次の試合にも持ち越せる', { lfItem: 'floppy', keepFound: true })]),
  }),
  f({
    item: 'hachimaki', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('lf-hachimaki', 'good', '必勝ハチマキを締め、最大体力+10', { lfItem: 'hachimaki', extraHp: 10 })]),
  }),
  // ---- 古いランタン（真っ暗ソウルの初クリアで獲得）を既存10ゲームへ（既存の効果キーを使う） ----
  f({
    item: 'old-lantern', game: 'puzzle', mode: 'fixed',
    effects: f([fx('ln-undo', 'good', 'ランタンで足元を照らして、1回だけ箱を手前に引ける（Xキー）', { undoOnce: true })]),
  }),
  f({
    item: 'old-lantern', game: 'race', mode: 'fixed',
    effects: f([fx('ln-respawn', 'good', 'ランタンの灯りを目印に、カートから追い出されても1回だけすぐ戻れる', { respawnOnce: true })]),
  }),
  f({
    item: 'old-lantern', game: 'fps', mode: 'fixed',
    effects: f([fx('ln-heart', 'good', 'ランタンのぬくもりで体力+1', { heartBonus: 1 })]),
  }),
  f({
    item: 'old-lantern', game: 'mohi-touch', mode: 'fixed',
    effects: f([fx('ln-glare', 'good', 'ランタンの光がまぶしくて、相手の手元が狂う', { rivalAccuracy: 0.85 })]),
  }),
  f({
    item: 'old-lantern', game: 'blowaway', mode: 'fixed',
    effects: f([fx('ln-retry', 'good', 'ランタンで照らして見直し、弱すぎた振りを1回だけ打ち直せる', { retryOnce: true })]),
  }),
  f({
    item: 'old-lantern', game: 'super-shogi', mode: 'fixed',
    effects: f([fx('ln-matta', 'good', 'ランタンで盤を照らして読み直し、待ったが1回増える', { extraMatta: 1 })]),
  }),
  f({
    item: 'old-lantern', game: 'kendama', mode: 'fixed',
    effects: f([fx('ln-guide', 'good', 'ランタンの灯りで溜めゲージに目安線が見える', { chargeGuide: true })]),
  }),
  f({
    item: 'old-lantern', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('ln-read', 'good', 'ランタンで手元が明るく、文字が1.15倍で読みやすい', { fontScale: 1.15 })]),
  }),
  f({
    item: 'old-lantern', game: 'find-file', mode: 'fixed',
    effects: f([fx('ln-highlight', 'good', 'ランタンで照らすと、手がかりの大事なところが目立つ', { clueHighlight: true })]),
  }),
  f({
    item: 'old-lantern', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('ln-lf', 'good', 'ランタンの灯りで目が慣れ、気合のゲージが2倍光る', { lfItem: 'old-lantern', hintBoost: 2 })]),
  }),
  // ---- 既存10アイテムを真っ暗ソウルへ（ds-items.js の DS_ITEM_EFFECTS を params.dsItem で引く） ----
  f({
    item: 'hachimaki', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-hachimaki', 'good', '必勝ハチマキを締めて、1回だけ捕まっても振りほどける', { dsItem: 'hachimaki' })]),
  }),
  f({
    item: 'floppy', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-floppy', 'good', 'フロッピーの古いメモに、金庫の番号の1桁目が残っていた', { dsItem: 'floppy' })]),
  }),
  f({
    item: 'agemohawk', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-agemohawk', 'bad', '油が懐中電灯のレンズについて、光の範囲が少し狭い', { dsItem: 'agemohawk' })]),
  }),
  f({
    item: 'movebox', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-movebox', 'good', '箱を押して鍛えた足腰で、スタミナが増える', { dsItem: 'movebox' })]),
  }),
  f({
    item: 'turbokart', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-turbokart', 'mixed', 'スタミナが大きく増えるが、電池をカートに使って残りが少ない', { dsItem: 'turbokart' })]),
  }),
  f({
    item: 'watergun', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-watergun', 'bad', '懐中電灯が水に濡れて、電池が少し減っている', { dsItem: 'watergun' })]),
  }),
  f({
    item: 'dekamohawk', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-dekamohawk', 'bad', 'デカモヒカンが天井や戸口にこすれて、足音が少し大きい', { dsItem: 'dekamohawk' })]),
  }),
  f({
    item: 'nasukoma', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-nasukoma', 'good', 'ナス駒を靴底に貼りつけて、足音が少し小さい', { dsItem: 'nasukoma' })]),
  }),
  f({
    item: 'fushigikendama', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-fushigikendama', 'mixed', 'ふしぎな力で光が遠くまで届くが、電池が半分しかない', { dsItem: 'fushigikendama' })]),
  }),
  f({
    item: 'shiori', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-shiori', 'good', 'しおりの書き込みで落ち着いて、スタミナが少し増える', { dsItem: 'shiori' })]),
  }),
  // ---- ソフビ怪獣（怪獣大決戦の初勝利で獲得）を既存11ゲームへ（既存の効果キーを使う） ----
  f({
    item: 'sofubi-kaiju', game: 'puzzle', mode: 'fixed',
    effects: f([fx('sk-undo', 'good', 'ソフビ怪獣が箱を引っぱって、1回だけ箱を手前に引ける（Xキー）', { undoOnce: true })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'race', mode: 'fixed',
    effects: f([fx('sk-respawn', 'good', 'ソフビ怪獣がつまみ上げて、カートから追い出されても1回だけすぐ戻れる', { respawnOnce: true })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'fps', mode: 'fixed',
    effects: f([fx('sk-heart', 'good', 'ソフビの丈夫さで体力+1', { heartBonus: 1 })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'mohi-touch', mode: 'fixed',
    effects: f([fx('sk-shield', 'good', 'ソフビ怪獣を盾にして、モヒカンが触られにくい', { hitScale: 0.85 })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'blowaway', mode: 'fixed',
    effects: f([fx('sk-power', 'good', '怪獣の気分で振りが強くなる', { powerBonus: 0.1 })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'super-shogi', mode: 'fixed',
    effects: f([fx('sk-matta', 'good', 'ソフビ怪獣が盤をのぞきこんで、待ったが1回増える', { extraMatta: 1 })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'kendama', mode: 'fixed',
    effects: f([fx('sk-kd', 'good', 'ソフビのやわらかさをまねて、全部の皿が少し受けやすい', { windowScale: 1.15 })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'novel-chicken', mode: 'fixed',
    effects: f([fx('sk-nv', 'good', 'タバコヌスがソフビ怪獣に見とれて、早押しが0.6秒遅れる', { aiDelay: 0.6 })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'find-file', mode: 'fixed',
    effects: f([fx('sk-ff', 'good', 'ソフビ怪獣に励まされ、外れの待ちが7秒になる', { penaltySec: 7 })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'lever-fighter', mode: 'fixed',
    effects: f([fx('sk-lf', 'good', '怪獣の頑丈さを見習い、最大体力+10', { lfItem: 'sofubi-kaiju', extraHp: 10 })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'dark-soul', mode: 'fixed',
    effects: f([fx('ds-sofubi', 'good', 'ソフビ怪獣を握りしめて落ち着き、スタミナが少し増える', { dsItem: 'sofubi-kaiju' })]),
  }),
  // ---- 12アイテムを怪獣大決戦へ（kj-rules.js の makeMods のキー。すべて MOD_LIMITS の範囲内） ----
  f({
    item: 'hachimaki', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-hachimaki', 'good', '必勝ハチマキを締めて、体力+20', { hpBonus: 20 })]),
  }),
  f({
    item: 'dekamohawk', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-dekamohawk', 'good', 'デカモヒカンの勢いで、パンチが少し強い', { punchPower: 1.15 })]),
  }),
  f({
    item: 'old-lantern', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-lantern', 'good', 'ランタンの灯りを胸に、光線の溜めが少し速い', { beamChargeRate: 1.25 })]),
  }),
  f({
    item: 'agemohawk', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-agemohawk', 'bad', '油で足元がすべって、歩くのが少し遅い', { walkSpeed: 0.85 })]),
  }),
  f({
    item: 'movebox', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-movebox', 'good', '箱を押して鍛えた体で、体力+10', { hpBonus: 10 })]),
  }),
  f({
    item: 'turbokart', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-turbokart', 'good', 'ターボの勢いで、歩くのが少し速い', { walkSpeed: 1.15 })]),
  }),
  f({
    item: 'watergun', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-watergun', 'good', '水で冷やして、光線の溜めが少し速い', { beamChargeRate: 1.15 })]),
  }),
  f({
    item: 'nasukoma', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-nasukoma', 'good', 'ナス駒をしっぽに付けて、しっぽが少し強い', { tailPower: 1.15 })]),
  }),
  f({
    item: 'fushigikendama', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-kendama', 'good', 'ふしぎな力で、キックが少し強い', { kickPower: 1.15 })]),
  }),
  f({
    item: 'shiori', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-shiori', 'good', 'しおりの書き込みで落ち着いて、体力+15', { hpBonus: 15 })]),
  }),
  f({
    item: 'floppy', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-floppy', 'good', 'フロッピーに保存した蹴り方で、キックが少し強い', { kickPower: 1.1 })]),
  }),
  f({
    item: 'sofubi-kaiju', game: 'kaiju', mode: 'fixed',
    effects: f([fx('kj-sofubi', 'good', 'ソフビ怪獣と並んで気合十分、体力+10・パンチが少し強い', { hpBonus: 10, punchPower: 1.1 })]),
  }),
]);

/**
 * 表に行が無い組（13組）は、わざと空けている。持ち込むと NO_EFFECT_LINES の「何も起きなかった」が出る。
 * ・自分が取れたゲームへ持ち帰る組（動く箱×パズル・ターボカート×レース・水鉄砲×FPS・古いランタン×真っ暗ソウル）
 * ・最初の5品（第1・2弾）とボス戦の一部（動く箱×レース、ターボカート×FPS、水鉄砲×パズル、デカモヒカン・揚げモヒカン×ボス3つ）
 * 0035 のバグ検査（C6）で確かめた。増やすときは test/item-table-gaps.test.js の一覧も直す。
 */
export const INTENTIONAL_GAPS = f([
  'movebox:puzzle', 'movebox:race', 'turbokart:fps', 'turbokart:race', 'watergun:fps', 'watergun:puzzle',
  'dekamohawk:fps', 'dekamohawk:puzzle', 'dekamohawk:race', 'agemohawk:fps', 'agemohawk:puzzle', 'agemohawk:race',
  'old-lantern:dark-soul',
]);

export const NO_EFFECT_LINES = f([
  '…しかし何も起きなかった。',
  '箱はただの箱だった。',
  'アイテムは静かに昼寝している。',
  'ポケットの中で「ぬ゛」と鳴った。それだけだった。',
]);

const MODES = ['fixed', 'random'];
const TAGS = ['good', 'bad', 'mixed'];
/** 効果の種類の表示名 */
export const TAG_LABELS = f({ good: '有利', bad: '不利', mixed: '有利／不利' });

/** 効果を引く。fixed は全部、random は重み付きで1つ */
export function lookupEffect(itemId, gameId, rng, table = EFFECT_TABLE) {
  const row = Array.isArray(table) ? table.find((r) => r && r.item === itemId && r.game === gameId) : null;
  if (!row) {
    return {
      kind: 'none', itemId, gameId, mode: null, effects: [], banner: null, line: pick(rng, NO_EFFECT_LINES),
    };
  }
  const effects = row.mode === 'random'
    ? [pickWeighted(rng, row.effects)].filter(Boolean)
    : [...row.effects];
  return {
    kind: 'effect',
    itemId,
    gameId,
    mode: row.mode,
    effects,
    banner: `アイテム効果：${effects.map((e) => e.label).join('／')}`,
    line: null,
  };
}

/** 持ち込み（null なら何も出ない） */
export function resolveCarry(carryId, gameId, rng, table = EFFECT_TABLE) {
  if (carryId === null || carryId === undefined) {
    return { kind: 'empty', effects: [], banner: null, line: null };
  }
  return lookupEffect(carryId, gameId, rng, table);
}

/** 結果画面に出す一行（「アイテム効果：〜（有利）」）。持ち込みなしは null */
export function effectSummary(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.kind === 'effect') {
    const list = (Array.isArray(result.effects) ? result.effects : [])
      .filter((e) => e && e.label)
      .map((e) => (TAG_LABELS[e.tag] ? `${e.label}（${TAG_LABELS[e.tag]}）` : e.label));
    return list.length ? `アイテム効果：${list.join('／')}` : null;
  }
  if (result.kind === 'none') return typeof result.line === 'string' && result.line ? result.line : null;
  return null;
}

/** params を順にマージ（後勝ち） */
export function mergeParams(effects) {
  const out = {};
  for (const e of Array.isArray(effects) ? effects : []) {
    if (e && e.params && typeof e.params === 'object') Object.assign(out, e.params);
  }
  return out;
}

const TOUCH_MOD_KEYS = f(['reachBonus', 'reachSeconds', 'accuracy', 'hitScale']);

/** 持ち込みの params → createMatch に渡す {hero, rival}（rival〇〇 は相手の mods） */
export function touchCarryMods(params) {
  const p = params && typeof params === 'object' ? params : {};
  const hero = {};
  const rival = {};
  for (const k of TOUCH_MOD_KEYS) {
    if (Number.isFinite(p[k])) hero[k] = p[k];
    const rk = `rival${k[0].toUpperCase()}${k.slice(1)}`;
    if (Number.isFinite(p[rk])) rival[k] = p[rk];
  }
  // 新しいアイテム（以前は表示だけで効いていなかった）
  if (p.touchDouble === true) hero.touchPoints = 2; // 1タッチが2回数えられる
  if (p.forgiveOnce === true) hero.forgive = 1; // 相手のタッチを1回だけ帳消し
  return { hero, rival };
}

/** 持ち込みの params → 積み上げ吹っ飛ばしの設定（主人公のターンだけに使う） */
export function stackCarryOptions(params) {
  const p = params && typeof params === 'object' ? params : {};
  const pos = (v) => (Number.isFinite(v) && v > 0 ? v : undefined);
  return {
    baseWidth: pos(p.baseWidth),
    timeLimit: pos(p.timeLimit),
    swingMult: pos(p.swingMult) ?? 1,
    powerBonus: Number.isFinite(p.powerBonus) ? p.powerBonus : 0,
    potWidthBonus: Number.isFinite(p.potWidthBonus) ? p.potWidthBonus : 0,
    retryOnce: p.retryOnce === true, // 1回だけ打ち直せる（以前は表示だけ）
  };
}

/** 表の検査。問題の文字列の配列（空なら正常） */
export function validateTable(table, { items = ITEMS, games = GAME_CATALOG.map((g) => g.id) } = {}) {
  const errs = [];
  if (!Array.isArray(table)) return ['表が配列ではない'];
  const itemIds = items.map((i) => i.id);
  const seen = new Set();
  table.forEach((row, i) => {
    const at = `行${i}`;
    if (!row || typeof row !== 'object') {
      errs.push(`${at}: 行が不正`);
      return;
    }
    if (!itemIds.includes(row.item)) errs.push(`${at}: 未知のアイテム ${row.item}`);
    if (!games.includes(row.game)) errs.push(`${at}: 未知のゲーム ${row.game}`);
    const key = `${row.item}\u0000${row.game}`;
    if (seen.has(key)) errs.push(`${at}: 重複 ${row.item}×${row.game}`);
    seen.add(key);
    if (!MODES.includes(row.mode)) errs.push(`${at}: mode が不正 ${row.mode}`);
    const effs = Array.isArray(row.effects) ? row.effects : [];
    if (!effs.length) errs.push(`${at}: effects が空`);
    effs.forEach((e, j) => {
      const et = `${at}.効果${j}`;
      if (!e || typeof e !== 'object') {
        errs.push(`${et}: 不正`);
        return;
      }
      if (typeof e.id !== 'string' || !e.id) errs.push(`${et}: id が無い`);
      if (typeof e.label !== 'string' || !e.label) errs.push(`${et}: label が無い`);
      if (!TAGS.includes(e.tag)) errs.push(`${et}: tag が不正 ${e.tag}`);
      if (row.mode === 'random' && e.weight !== undefined && !(Number(e.weight) > 0)) {
        errs.push(`${et}: weight が正でない`);
      }
    });
    if (row.mode === 'random' && effs.length < 2) errs.push(`${at}: random は効果が2つ以上必要`);
  });
  return errs;
}
