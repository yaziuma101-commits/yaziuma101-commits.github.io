// 絵から入ったときに最初に出す「ゲームの紹介」の中身（three.js・DOM・Web Audio に依存しない）。
// 名前・どんなゲームか（2〜3行）・操作の一覧・勝ち方・始め方。工事中の部屋も同じ形。
import { gameById } from './game-catalog.js';

const f = Object.freeze;
const row = (k, v) => f([k, v]);

export const INTRO_START_NOTE = 'Enter / Space で始める ／ Esc で館に戻る';
export const CONSTRUCTION_NOTE = 'Enter / Space で中を見る ／ Esc で館に戻る';

export const GAME_INTROS = f({
  'mohi-touch': f({
    title: 'モヒカンタッチタッチ',
    lines: f([
      '土俵の上で、デカ頭アリヌスとモヒカンを触り合う勝負。',
      '足はその場から動かない。体を傾けたり、しゃがんだりして相手の手をかわそう。',
      '相手の手をよく見て、ギリギリでかわそう。',
    ]),
    rows: f([
      row('A / D', '体を左右に傾けて避ける'),
      row('S', 'しゃがんで避ける'),
      row('W', '前のめり（届きやすいが避けにくい）'),
      row('J / 左クリック', '左手でモヒカンをタッチ'),
      row('K', '右手でモヒカンをタッチ'),
      row('Esc', 'ポーズ（館に戻る）'),
    ]),
    win: '勝ち方：60秒のうちに、相手のモヒカンを多くタッチした方の勝ち',
  }),
  blowaway: f({
    title: '積み上げたもの吹っ飛ばし',
    lines: f([
      '動いているモヒカンを落として、どんどん積み上げるゲーム。',
      'ずれてはみ出した部分は切り落とされる。ぴったり重ねるほど高く積める。',
      '積み上げたら、最後は派手に吹っ飛ばせ！',
    ]),
    rows: f([
      row('Space', 'モヒカンを落として積む'),
      row('画面下の案内', 'そのほかの操作は場面ごとに表示'),
      row('Esc', 'ポーズ（館に戻る）'),
    ]),
    win: '勝ち方：できるだけ高く積み上げて、思いきり吹っ飛ばす',
  }),
  'super-shogi': f({
    title: 'スーパー将棋',
    lines: f([
      '和室で、おなすくんと本将棋を指す。持ち駒・成り・王手・詰みはふつうの将棋どおり。',
      '対局の前に「駒工房」でオリジナルの駒を1つ作る。持ち駒として1枚持って始まる。',
      'おなすくんも毎回ちがう駒「ナス」を持ってくる。',
    ]),
    rows: f([
      row('クリック', '駒を選ぶ → 光るマスをクリックで指す'),
      row('持ち駒をクリック', '打てるマスが光る'),
      row('矢印 + Enter', 'キーボードでも指せる'),
      row('P / N', '成る ／ 成らない'),
      row('U・待ったボタン', '待った（1局に3回まで）'),
      row('投了ボタン', '負けを認める'),
      row('Esc', '選択解除・ポーズ'),
    ]),
    win: '勝ち方：おなすくんの王を詰ませたら勝ち（千日手は引き分け）',
  }),
});

const titleOf = (gameId, fallback) => {
  const g = typeof gameId === 'string' ? gameById(gameId) : null;
  return g && g.title ? g.title : fallback;
};

/** ゲームの紹介。未知のゲームは null。carryLine は持ち込んだアイテムの効果の1行 */
export function gameIntroView(gameId, { carryLine = null } = {}) {
  const d = typeof gameId === 'string' ? GAME_INTROS[gameId] : null;
  if (!d) return null;
  return {
    gameId,
    title: titleOf(gameId, d.title),
    sub: '',
    lines: [...d.lines],
    rows: d.rows.map((r) => [...r]),
    win: d.win,
    carry: typeof carryLine === 'string' && carryLine ? carryLine : null,
    note: INTRO_START_NOTE,
  };
}

/** 工事中の部屋の紹介（同じ形）。何のゲームになる予定かを出す */
export function constructionIntroView(gameId, title = null) {
  const name = (typeof title === 'string' && title) || titleOf(gameId, 'ひみつのゲーム');
  return {
    gameId: typeof gameId === 'string' ? gameId : null,
    title: name,
    sub: '',
    lines: [
      'このゲームはまだ工事中。',
      `ここは「${name}」になる予定の部屋。`,
      '職人が準備しているので、できあがるまで待っててね。',
    ],
    rows: [],
    win: '',
    carry: null,
    note: CONSTRUCTION_NOTE,
  };
}
