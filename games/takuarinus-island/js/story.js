// 物語の進み（three.js・DOM に依存しない）。storage は localStorage 互換。
// オープニング → 3人の番長から仲間を助ける → 館がせり上がる（9人のビッグヌスの封印が解ける）。

export const STORY_STORAGE_KEY = 'takuarinus-story-v1';

/** 番長 → さらわれていた仲間（番長を倒すと助け出せる）。先輩は最初からいる */
export const RESCUE_BY_BOSS = Object.freeze({ puzzle: 'chibi', race: 'peta', fps: 'chibimohi' });
export const ALWAYS_THERE = Object.freeze(['senpai']);
export const BOSS_COUNT = Object.keys(RESCUE_BY_BOSS).length;

/** 助けたお礼の一言（ハブに戻ったとき1回だけ） */
export const THANKS_LINES = Object.freeze({
  chibi: ['タクアリヌス！ 助けに来てくれたんだね！', 'パズル番長の箱に閉じこめられてたんだ……ありがとう！'],
  peta: ['うわーん、カートの荷台でずっと揺られてたよ〜', 'もう平らになっちゃうかと思った！ ありがとう！'],
  chibimohi: ['（ちびモヒが うれしそうに ぴょんぴょん跳ねている）', '（水鉄砲で びしょびしょだったらしい）'],
});

/** 館がせり上がった後の先輩のことば */
export const SEAL_LINES = Object.freeze([
  'な、なんだ今の地響きは……！？',
  '番長を倒したことで9人のビッグヌス達の封印が解かれてしまった。',
  'このままでは島どころか世界が危ない！',
  'タクアリヌス、あの絵画の館へ行ってくれ！',
]);

/** オープニングの先輩のことば（字幕） */
export const OPENING_LINES = Object.freeze([
  'タクアリヌス……よく来てくれた。',
  '大変なんだ。3人の番長に仲間たちが誘拐された。',
  'ちびも、ぺたも、ちびモヒも……みんな連れて行かれてしまった。',
  '助けに行ってほしい。島の門の先に、番長たちが待っている。',
]);

const blank = () => ({
  openingSeen: false, mansionRisen: false, greeted: [], endingSeen: false, allPaintingsSeen: false,
  mansionIntroSeen: false,
});

export function normalizeStory(v) {
  const o = blank();
  if (!v || typeof v !== 'object' || Array.isArray(v)) return o;
  o.openingSeen = v.openingSeen === true;
  o.mansionRisen = v.mansionRisen === true;
  o.endingSeen = v.endingSeen === true;
  o.allPaintingsSeen = v.allPaintingsSeen === true;
  o.mansionIntroSeen = v.mansionIntroSeen === true;
  o.greeted = Array.isArray(v.greeted) ? v.greeted.filter((id) => Object.values(RESCUE_BY_BOSS).includes(id)) : [];
  return o;
}

export function loadStory(storage) {
  try {
    const raw = storage && storage.getItem(STORY_STORAGE_KEY);
    return normalizeStory(raw ? JSON.parse(raw) : null);
  } catch {
    return blank();
  }
}

export function saveStory(storage, story) {
  try {
    storage.setItem(STORY_STORAGE_KEY, JSON.stringify(normalizeStory(story)));
    return true;
  } catch {
    return false;
  }
}

/** 倒した番長の id の配列 → いま島にいる仲間の id（先輩＋助けた仲間） */
export function rescuedCompanions(defeatedBossIds) {
  const ids = Array.isArray(defeatedBossIds) ? defeatedBossIds : [];
  const out = [...ALWAYS_THERE];
  for (const [boss, npc] of Object.entries(RESCUE_BY_BOSS)) if (ids.includes(boss)) out.push(npc);
  return out;
}

/** まだお礼を言っていない、助けたばかりの仲間（ハブに戻ったときに順に話しかけてくる） */
export function pendingThanks(defeatedBossIds, story) {
  const s = normalizeStory(story);
  return rescuedCompanions(defeatedBossIds).filter((id) => THANKS_LINES[id] && !s.greeted.includes(id));
}

export function allBossesDefeated(defeatedBossIds) {
  const ids = Array.isArray(defeatedBossIds) ? defeatedBossIds : [];
  return Object.keys(RESCUE_BY_BOSS).every((b) => ids.includes(b));
}

/** 館が見える・入れるか */
export function mansionOpen(story) {
  return normalizeStory(story).mansionRisen;
}

/** 先輩に話したとき、館がせり上がる演出を始めるか */
export function shouldRaiseMansion(defeatedBossIds, story) {
  return allBossesDefeated(defeatedBossIds) && !normalizeStory(story).mansionRisen;
}

/** 先輩のふだんのひとこと（物語の進みで変わる） */
export function senpaiHint(defeatedBossIds, story) {
  const ids = Array.isArray(defeatedBossIds) ? defeatedBossIds : [];
  if (mansionOpen(story)) return '絵画の館の9人のビッグヌスを止めてくれ。絵に飛び込めば勝負だ！';
  const left = Object.keys(RESCUE_BY_BOSS).filter((b) => !ids.includes(b)).length;
  if (left === 0) return 'おお……！ 3人とも助け出したな！';
  return `番長はあと${left}人。仲間たちを頼んだぞ。`;
}

// ---- 館がせり上がる演出の時間割（秒） ----
export const RISE_TIMELINE = Object.freeze({
  fakeEnd: 4.5, // 「めでたし めでたし」と見せかける
  rumble: 2.5, // 突然の地響き（画面が揺れる）
  rise: 5, // 館が下からせり上がる
  settle: 1.2, // 土煙がおさまる
});

/** 経過秒 → {phase, k(その段の進み 0..1), shake(揺れの強さ 0..1), riseY(0..1)} */
export function riseAt(t) {
  const T = RISE_TIMELINE;
  const a = T.fakeEnd;
  const b = a + T.rumble;
  const c = b + T.rise;
  const d = c + T.settle;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  if (t < a) return { phase: 'fakeEnd', k: clamp01(t / a), shake: 0, riseY: 0 };
  if (t < b) return { phase: 'rumble', k: clamp01((t - a) / T.rumble), shake: 0.3 + 0.5 * ((t - a) / T.rumble), riseY: 0 };
  if (t < c) {
    const k = clamp01((t - b) / T.rise);
    return { phase: 'rise', k, shake: 0.8 * (1 - k * 0.6), riseY: k * k * (3 - 2 * k) };
  }
  if (t < d) return { phase: 'settle', k: clamp01((t - c) / T.settle), shake: 0.2 * (1 - (t - c) / T.settle), riseY: 1 };
  return { phase: 'done', k: 1, shake: 0, riseY: 1 };
}
export const RISE_TOTAL = Object.values(RISE_TIMELINE).reduce((a, v) => a + v, 0);

// ---- 本当のエンディングと、クリア後 ----
export const MANSION_BOSS_COUNT = 9;

/** 館の9人を全員倒して、まだエンディングを見ていない */
export function finaleDue(defeatedMansionCount, story) {
  return Number(defeatedMansionCount) >= MANSION_BOSS_COUNT && !normalizeStory(story).endingSeen;
}

/** 高難易度を選べるか（本当のエンディングを見た後） */
export function hardUnlocked(story) {
  return normalizeStory(story).endingSeen;
}

/** 絵を全部集めて、まだイベントを見ていない */
export function allPaintingsEventDue(allCollected, story) {
  return !!allCollected && !normalizeStory(story).allPaintingsSeen;
}

export const FINALE_LINES = Object.freeze([
  'やった……！ 9人のビッグヌスを全員倒したぞ！',
  '島も、世界も救われた。みんなが広間で待ってるぞ！',
]);

/** 全部の絵を集めたときのイベント（大がかりに見せて、ちびモヒが褒めるだけ） */
export const ALL_PAINTINGS_TIMELINE = Object.freeze({
  dark: 3, // 空が暗くなる
  rumble: 3, // 地響き・大きな影が近づく
  reveal: 2.5, // 「何かが来る……！」→ 光
  chibi: 6, // ちびモヒが出てきて褒める
});
export const ALL_PAINTINGS_LINES = Object.freeze(['……全部集めたね！', 'すごいすごい！ それだけ！']);

export function allPaintingsAt(t) {
  const T = ALL_PAINTINGS_TIMELINE;
  const a = T.dark;
  const b = a + T.rumble;
  const c = b + T.reveal;
  const d = c + T.chibi;
  const k = (v, len) => Math.min(1, Math.max(0, v / len));
  if (t < a) return { phase: 'dark', k: k(t, T.dark) };
  if (t < b) return { phase: 'rumble', k: k(t - a, T.rumble) };
  if (t < c) return { phase: 'reveal', k: k(t - b, T.reveal) };
  if (t < d) return { phase: 'chibi', k: k(t - c, T.chibi) };
  return { phase: 'done', k: 1 };
}
export const ALL_PAINTINGS_TOTAL = Object.values(ALL_PAINTINGS_TIMELINE).reduce((x, v) => x + v, 0);

// ---- 館に初めて入ったときのイベント（依頼者の指摘 2026-11-04）----
// 9人のビッグヌスが広間に現れ、ひとりずつ宣戦布告する。映画のように、ひとりずつ寄って映す。

/** 宣戦布告（castId は cast-defs.js のキャラクター。並びは広間の左から右） */
export const MANSION_INTRO_LINES = Object.freeze([
  Object.freeze({ castId: 'dekaatama', line: 'ふぅ〜っ！ やっと絵の外の空気が吸えたぜ！' }),
  Object.freeze({ castId: 'mohifry', line: '封印をといてくれて、ありがとよ、タクアリヌス！' }),
  Object.freeze({ castId: 'onasu', line: 'おかげで、これからは好き放題あばれられるなぁ〜' }),
  Object.freeze({ castId: 'sankaku', line: '島じゅうのモヒカンを三角にしてやる……計算どおりだ。' }),
  Object.freeze({ castId: 'tabako', line: '館の絵は、ぜんぶオレたちがいただいた！' }),
  Object.freeze({ castId: 'tofu', line: 'くずれるまで、あばれてやるぞ！' }),
  Object.freeze({ castId: 'mukimuki', line: 'オレたちを止めてみたいか？ なら筋肉で語れ！' }),
  Object.freeze({ castId: 'neko', line: '止めたかったら、絵の中に飛び込んでくるにゃ。' }),
  Object.freeze({ castId: 'megane', line: '9人全員、倒せるものならな！ ……チョキチョキ。' }),
]);

export const MANSION_INTRO_TIMELINE = Object.freeze({
  dark: 3.2, // 暗い広間。絵がつぎつぎに光る
  burst: 2.4, // 9枚の絵から、ビッグヌスが飛び出す
  roll: 2.8 * 9, // ひとりずつ寄って、ひとことずつ
  all: 4.6, // 9人そろって見得を切る（引きの画）
});
export const MANSION_INTRO_TOTAL = Object.values(MANSION_INTRO_TIMELINE).reduce((x, v) => x + v, 0);

/** t 秒の時点の場面。roll のときは who（0〜8）も返す */
export function mansionIntroAt(t) {
  const T = MANSION_INTRO_TIMELINE;
  const a = T.dark;
  const b = a + T.burst;
  const c = b + T.roll;
  const d = c + T.all;
  const k = (v, len) => Math.min(1, Math.max(0, v / len));
  if (t < a) return { phase: 'dark', k: k(t, T.dark) };
  if (t < b) return { phase: 'burst', k: k(t - a, T.burst) };
  if (t < c) {
    const per = T.roll / MANSION_INTRO_LINES.length;
    const who = Math.min(MANSION_INTRO_LINES.length - 1, Math.floor((t - b) / per));
    return { phase: 'roll', who, k: k(t - b - who * per, per) };
  }
  if (t < d) return { phase: 'all', k: k(t - c, T.all) };
  return { phase: 'done', k: 1 };
}

/** 館に初めて入ったか（館がせり上がったあと、まだイベントを見ておらず、館のボスも1人も倒していない） */
export function mansionIntroDue(story, defeatedMansionCount = 0) {
  const s = normalizeStory(story);
  return s.mansionRisen && !s.mansionIntroSeen && !(defeatedMansionCount > 0);
}

/** てのひらくんは最初から館の入口にいるので、初めて話すとビッグヌスとは無関係だと言う（依頼者の指摘 2026-11-04） */
export const TENOHIRA_ALIBI = Object.freeze([
  'ぼく、ビッグヌスとは全っ然関係ないからね！ ただの手だよ。',
  'たまたま館の入口にいるだけ。絵からも出てきてないし、宣戦布告もしてない。',
  'だから殴らないで。ハイタッチなら大歓迎！',
]);

/** 広間の仲間（島で助けた3人）のひとこと。進み具合に合わせる（依頼者の指摘: 最初から「絵が全部集まった」と言っていた） */
export const GATHER_LINES_BY_STAGE = Object.freeze({
  start: Object.freeze([
    'ここが絵画の館……。絵の中から、いやな気配がする。',
    'ビッグヌスたち、絵の中で待ちかまえてるみたい。気をつけて！',
    '絵に向かって跳べば、中に飛び込めるんだって。',
  ]),
  mid: Object.freeze([
    'やっつけたビッグヌスも、ここに来てくつろいでるよ。',
    'まだ布のかかった絵がある。ぜんぶ取り返そう！',
    'その調子！ 残りのビッグヌスも絵の中で待ってるよ。',
  ]),
  done: Object.freeze([
    'ビッグヌスたちも、もう悪さはしないって。',
    'みんなでここに集まると、なんだか楽しいね。',
    '高難易度で勝つと、まだ見たことのない絵がもらえるんだって。',
  ]),
  complete: Object.freeze([
    'ここの絵、ぜんぶタクアリヌスが取り返したんだね。',
    'みんなでここに集まると、なんだか楽しいね。',
    'ビッグヌスたちも、もう悪さはしないって。',
  ]),
});

/** 館のボスを何人倒したか・絵を全部集めたかで、どのひとことを使うか */
export function gatherStage(defeatedMansionCount, allCollected = false) {
  if (allCollected) return 'complete';
  if (defeatedMansionCount >= MANSION_BOSS_COUNT) return 'done';
  return defeatedMansionCount > 0 ? 'mid' : 'start';
}
