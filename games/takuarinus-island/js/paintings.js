// 絵の入手（three.js・DOM に依存しない）。番長・館のボスに勝つと1枚、高難易度で勝つともう1枚。
// 手に入れた絵はギャラリーモードで見られ、絵画の館の広間に飾られる（それまでは布がかかって見えない）。
import { GAME_CATALOG } from './game-catalog.js';
import { BOSSES } from './bosses.js';
import { DECOR_PAINTINGS } from './gallery-data.js';

export const PAINTINGS_STORAGE_KEY = 'takuarinus-paintings-v1';

const R = (paintingId, gameId, tier, comment) => Object.freeze({ paintingId, gameId, tier, comment });

/** 入手できる絵（ふつう12枚＋高難易度12枚）。comment は手に入れた絵に添える一言 */
export const PAINTING_REWARDS = Object.freeze([
  R('tenohira', 'puzzle', 'normal', '箱を押しすぎて手のひらが主役になった。'),
  R('inemuri-kart', 'race', 'normal', 'レースの後は、カートの上でひと眠り。'),
  R('taki', 'fps', 'normal', '水鉄砲の撃ちすぎで、ついに滝になった。'),
  R('atama-poripori', 'mohi-touch', 'normal', 'タッチされすぎて頭がかゆい。'),
  R('mohikan-motte', 'blowaway', 'normal', '吹っ飛んだモヒカンを拾って帰るところ。'),
  R('murasaki', 'super-shogi', 'normal', 'おなすくんの親戚。たぶん。'),
  R('manmaru', 'kendama', 'normal', 'けん玉の玉になりたかった親子。'),
  R('nakimushi', 'novel-chicken', 'normal', '一夜漬けの小説が泣ける話だったらしい。'),
  R('akaruku-natta', 'find-file', 'normal', 'ファイルは見つからないが、部屋は明るくなった。'),
  R('mohikan-nukitori', 'lever-fighter', 'normal', '必殺技「モヒカンぬきとり」。真似しないでね。'),
  R('neko-kao', 'dark-soul', 'normal', '暗闇でいちばん怖かったのは、この顔。'),
  R('mohikan-chikazuku', 'kaiju', 'normal', '怪獣よりも大きく見えるモヒカン。'),
  R('heya-no-sumi', 'puzzle', 'hard', '難しいパズルを解いたあと、部屋の隅で反省会。'),
  R('gogo', 'race', 'hard', '本気のレースを制した者だけが踊れるダンス。'),
  R('graffiti', 'fps', 'hard', '強い番長の壁に、勝利の落書き。'),
  R('double', 'mohi-touch', 'hard', 'タッチが速すぎて二人に見える。'),
  R('kinniku-mohi', 'blowaway', 'hard', '本気の吹っ飛ばしで、モヒカンまで鍛えられた。'),
  R('trump-card', 'super-shogi', 'hard', '将棋の切り札はトランプだった。'),
  R('ashidake', 'kendama', 'hard', '高難易度のけん玉は、足で決める。'),
  R('single', 'novel-chicken', 'hard', '夜通し読み切った、ひとりの朝。'),
  R('marugao', 'find-file', 'hard', '探していたファイルの中に、まるい顔がいた。'),
  R('nagamohi', 'lever-fighter', 'hard', '真剣勝負の末、モヒカンが伸びた。'),
  R('tenshi', 'dark-soul', 'hard', '真っ暗を抜けた先に、天使がいた。'),
  R('nakayoshi', 'kaiju', 'hard', '怪獣とも、最後はなかよし。'),
]);

/** 布をかけずに最初から飾ってある絵 */
export const ALWAYS_SHOWN = Object.freeze(DECOR_PAINTINGS.map((p) => p.id)
  .filter((id) => !PAINTING_REWARDS.some((r) => r.paintingId === id)));

/** 館の9本のゲームの相手（ビッグヌス）。castId は cast-defs.js のキャラクター */
export const MANSION_BOSSES = Object.freeze({
  'mohi-touch': { castId: 'dekaatama', name: 'デカ頭アリヌス' },
  blowaway: { castId: 'mohifry', name: 'モヒフライ' },
  'super-shogi': { castId: 'onasu', name: 'おなすくん' },
  kendama: { castId: 'sankaku', name: 'さんかくアリヌス' },
  'novel-chicken': { castId: 'tabako', name: 'タバコヌス' },
  'find-file': { castId: 'tofu', name: 'とうふアリヌス' },
  'lever-fighter': { castId: 'mukimuki', name: 'ムキムキヌス' },
  'dark-soul': { castId: 'neko', name: 'ねこアリヌス' },
  kaiju: { castId: 'megane', name: 'メガネ星人' },
});
export const MANSION_GAME_IDS = Object.freeze(Object.keys(MANSION_BOSSES));
const BOSS_GAME_IDS = Object.freeze(['puzzle', 'race', 'fps']);

function gameTitle(gameId) {
  const g = GAME_CATALOG.find((x) => x.id === gameId);
  return g ? g.title : gameId;
}

/** 勝つ相手の名前（番長は bosses.js、館は MANSION_BOSSES） */
export function opponentName(gameId) {
  const b = BOSSES.find((x) => x.id === gameId);
  if (b) return b.name;
  return MANSION_BOSSES[gameId] ? MANSION_BOSSES[gameId].name : '相手';
}

export function rewardFor(gameId, tier = 'normal') {
  return PAINTING_REWARDS.find((r) => r.gameId === gameId && r.tier === tier) || null;
}

export function rewardByPainting(paintingId) {
  return PAINTING_REWARDS.find((r) => r.paintingId === paintingId) || null;
}

/** まだの絵に書く入手方法 */
export function howToGet(reward) {
  if (!reward) return '';
  const game = `「${gameTitle(reward.gameId)}」`;
  const who = `${opponentName(reward.gameId)}に勝つ`;
  return reward.tier === 'hard' ? `クリア後、${game}の高難易度で${who}` : `${game}で${who}`;
}

const blank = () => ({ earned: [] });

/** 差し替えた絵の古い id（これまでのセーブを新しい id に読み替える） */
export const RENAMED_PAINTINGS = Object.freeze({ futatsugao: 'marugao' });

export function normalizePaintings(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.earned)) return blank();
  const ids = PAINTING_REWARDS.map((r) => r.paintingId);
  const earned = v.earned.map((id) => RENAMED_PAINTINGS[id] || id);
  return { earned: [...new Set(earned.filter((id) => ids.includes(id)))] };
}

export function loadPaintings(storage) {
  try {
    const raw = storage && storage.getItem(PAINTINGS_STORAGE_KEY);
    return normalizePaintings(raw ? JSON.parse(raw) : null);
  } catch {
    return blank();
  }
}

export function savePaintings(storage, state) {
  try {
    storage.setItem(PAINTINGS_STORAGE_KEY, JSON.stringify(normalizePaintings(state)));
    return true;
  } catch {
    return false;
  }
}

/** 勝ったときに呼ぶ。{state, reward, isNew}（その段の絵が無ければ reward は null） */
export function earnPainting(state, gameId, tier = 'normal') {
  const s = normalizePaintings(state);
  const reward = rewardFor(gameId, tier === 'hard' ? 'hard' : 'normal');
  if (!reward) return { state: s, reward: null, isNew: false };
  const isNew = !s.earned.includes(reward.paintingId);
  return { state: isNew ? { earned: [...s.earned, reward.paintingId] } : s, reward, isNew };
}

/** これまでのセーブ（勝ったゲームの一覧）から、ふつうの絵を渡しておく */
export function migratePaintings(state, clearedGameIds) {
  let s = normalizePaintings(state);
  for (const g of Array.isArray(clearedGameIds) ? clearedGameIds : []) s = earnPainting(s, g, 'normal').state;
  return s;
}

export function hasPainting(state, paintingId) {
  return normalizePaintings(state).earned.includes(paintingId);
}

/**
 * 最初から飾ってある絵のうち、依頼者の絵の開放（依頼者の指摘 2026-11-04）。
 * 依頼者の指定どおり15枚: 5枚は3人の番長を倒したとき、10枚は9人のビッグヌスを倒したとき。
 * 依頼者の絵は16枚あるので「たかくてとどかぬ」は最初から見える（どちらにも無い絵は最初から見える）
 */
export const DECOR_UNLOCK = Object.freeze({
  bosses: Object.freeze(['ougi', 'tsukue', 'yoru-no-umi', 'hikkoshi', 'banzai']),
  mansion: Object.freeze(['junban', 'kami-nobita', 'otabe', 'safe', 'chikarakobu',
    'softcream', 'mohikan-no-ame', 'korogaru', 'oi', 'yubi']),
});
export const DECOR_HOW = Object.freeze({
  bosses: '3人の番長をすべて倒す',
  mansion: '9人のビッグヌスをすべて倒す',
});

/** 最初から飾ってある絵1枚ずつのひとこと（依頼者の指摘: 「はじめから飾ってある絵」で統一しない） */
export const DECOR_COMMENTS = Object.freeze({
  'chibimohi-to': 'ちびモヒと散歩。ちびモヒのほうが歩くのが速い。',
  sankyoudai: 'モヒカン三きょうだい。みんな額からはみ出している。',
  takakute: '高いところのドーナツに、愛の歌をささげている。届かない。',
  ougi: '大きなおうぎで、ひと仕事終えたあとのひとあおぎ。',
  junban: 'カードを順番に回していく手品。最後のヌスだけ、まだ気づいていない。',
  tsukue: '机にひじをついて、考えごと。宿題はたぶん終わっていない。',
  'kami-nobita': '髪がのびた。モヒカンだけでは足りなかったらしい。',
  'yoru-no-umi': '夜の海を、ふたりでながめている。波の音しかしない。',
  otabe: 'おたべ。差し出されたものに、モヒカンごと食いついた。',
  hikkoshi: '引っ越しの荷物の前で、力つきて倒れた。',
  safe: 'モヒカンは飛んでいったけど、本体はセーフ。',
  chikarakobu: 'ちからこぶ自慢。モヒカンもついでに力んでいる。',
  banzai: 'ばんざい！ 何がうれしいのかは、本人もよく知らない。',
  softcream: 'ソフトクリームだと思ったら、モヒカンだった。',
  'mohikan-no-ame': 'モヒカンの雨がふる日。傘はいらない。たぶん。',
  korogaru: 'ころがるモヒカン。坂の下まで止まらない。',
  oi: '「おーい！」と呼んだら、小さいヌスが手をふり返した。',
  yubi: '大きな指の上に、ちょこんと乗っている。',
});

/** 最初から飾ってある絵が、いまの進みで見えるか（state は絵の保存。倒したボスは絵から分かる） */
export function decorUnlocked(state, paintingId) {
  if (DECOR_UNLOCK.bosses.includes(paintingId)) return defeatedBossGames(state).length >= BOSS_GAME_IDS.length;
  if (DECOR_UNLOCK.mansion.includes(paintingId)) return defeatedMansionGames(state).length >= MANSION_GAME_IDS.length;
  return true;
}

/** まだ見えない最初からの絵の入手方法（見えるなら null） */
export function decorHowToGet(state, paintingId) {
  if (decorUnlocked(state, paintingId)) return null;
  return DECOR_UNLOCK.bosses.includes(paintingId) ? DECOR_HOW.bosses : DECOR_HOW.mansion;
}

/** 館に絵を見せてよいか（入手した絵と、最初から飾ってある絵のうち開放したもの） */
export function shownInMansion(state, paintingId) {
  if (ALWAYS_SHOWN.includes(paintingId)) return decorUnlocked(state, paintingId);
  return hasPainting(state, paintingId);
}

/** 倒した館のボス（ふつうの絵を持っているゲーム） */
export function defeatedMansionGames(state) {
  return MANSION_GAME_IDS.filter((g) => {
    const r = rewardFor(g, 'normal');
    return r && hasPainting(state, r.paintingId);
  });
}

export function defeatedBossGames(state) {
  return BOSS_GAME_IDS.filter((g) => {
    const r = rewardFor(g, 'normal');
    return r && hasPainting(state, r.paintingId);
  });
}

export function collectedCount(state) {
  return normalizePaintings(state).earned.length;
}

export const PAINTING_TOTAL = PAINTING_REWARDS.length;

export function allCollected(state) {
  return collectedCount(state) >= PAINTING_TOTAL;
}
