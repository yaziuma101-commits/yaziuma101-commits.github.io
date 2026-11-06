// 高難易度（three.js・DOM に依存しない）。館のボスを全員倒してエンディングを見ると、全12本で選べる。

const f = Object.freeze;

const HARD_FOE_FPS = 1.5;
/** 高難易度の敵の強さ（場面が直接読む値） */
export const HARD_FOE = f({ fps: HARD_FOE_FPS, kaiju: 1.35, lfHp: 140 });

/**
 * ゲームID → 高難易度で重ねる値（持ち込みの params の後に重ねる＝こちらが勝つ）。
 * 依頼者の指摘（2026-11-04）: 主人公を縛るのではなく、敵を強くする。レース番長・真っ暗ソウル・
 * 一夜漬けチキンレースは今のまま。どのゲームにも hard: true が付くので、各場面は carry.hard を見て
 * 相手をいちばん強い段にする（タッチ・吹っ飛ばし・将棋・けん玉・ファイル・レバガチャ・怪獣）。
 */
export const HARD_PARAMS = f({
  puzzle: f({}), // 番長の問題が難しくなる（levels.js の HARD_LEVELS）
  race: f({ steerLag: 0.3, screenDrops: true }), // 今のまま
  fps: f({ foeSpeed: HARD_FOE_FPS }), // 番長が速く動き、速い弾を倍の間隔で、左右にも撃つ
  'mohi-touch': f({ rivalAccuracy: 1.35, rivalReachBonus: 0.15 }), // ＋相手が「つよい」
  blowaway: f({}), // 相手が「つよい」で積む
  'super-shogi': f({ hardFoeGold: 1 }), // 相手が金を1枚多く持ち、「つよい」で指す（持ち込みの品とは別に効く）
  kendama: f({}), // 相手がいちばん強い段
  'novel-chicken': f({ pageSpeed: 1.6, textShake: true, fontScale: 0.8 }), // 今のまま
  'find-file': f({ aiDelayMul: 0.5 }), // ＋相手がいちばん速い段
  'lever-fighter': f({}), // 相手がいちばん強い段で、体力も多い（HARD_FOE.lfHp）
  'dark-soul': f({ dsItem: 'agemohawk' }), // 今のまま
  kaiju: f({}), // メガネ星人がいちばん強い段で、さらに体力・速さ・攻撃の間を強める（HARD_FOE.kaiju）
});

export const DIFFICULTY_CHOICES = f([
  f({ id: null, label: 'ふつう' }), // id null: Esc で閉じたときも ふつう
  f({ id: 'hard', label: '高難易度（クリアで追加の絵）' }),
]);

/** 持ち込みの品と高難易度の両方が持つとき、掛け合わせる値 */
export const HARD_MULTIPLY = f(['rivalAccuracy']);

/** 持ち込みの params に高難易度の値を重ねる（ふつうならそのまま） */
export function withDifficulty(params, gameId, difficulty) {
  const base = params && typeof params === 'object' ? params : {};
  if (difficulty !== 'hard' || !HARD_PARAMS[gameId]) return { ...base };
  const out = { ...base, ...HARD_PARAMS[gameId], hard: true };
  // 持ち込みの品と同じ値は、上書きせずに掛け合わせる（品の効果を消さない。2026-11-04 のバグ洗い）
  for (const k of HARD_MULTIPLY) {
    if (Number.isFinite(base[k]) && Number.isFinite(HARD_PARAMS[gameId][k])) out[k] = base[k] * HARD_PARAMS[gameId][k];
  }
  return out;
}
