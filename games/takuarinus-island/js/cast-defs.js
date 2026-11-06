// 新キャラクター16体の形データ（three.js・DOM に依存しない）。
// 座標規約：キャラは +z を向き、画面から見た右が +x。単位は 1＝約1m、足元が y=0。
// 色は palette.js の値だけを使う。
import { PALETTE as C } from './palette.js';
import { pick } from './seeded-rng.js';

/** 主人公テクスチャ（dotnus-002.png）の白い顔の切り出し領域 */
export const FACE_CROP = Object.freeze({ x: 280, y: 248, w: 95, h: 72 });

/** 図形ごとの size の要素数 */
export const SHAPE_ARITY = Object.freeze({
  sphere: 1, box: 3, cylinder: 2, cone: 2, torus: 2, fan: 3, tube: 2, plane: 2,
});

const HP = Math.PI / 2;
const S = [-1, 1];
const P = (role, shape, pos, size, color, extra) => ({
  role, shape, pos, size, color, ...(extra || {}),
});
const FACE = (pos, size, round = false) => P('face', 'plane', pos, size, C.faceWindow, round ? { window: 'round' } : undefined);

/** 細い脚とブーツ（左右）。脚はブーツの上から h の長さ */
const LEGS = (x, h, legColor = C.heroLeg, bootColor = C.heroBoots, boot = [0.18, 0.12, 0.3]) => S.flatMap((s) => [
  P('leg', 'cylinder', [s * x, boot[1] + h / 2, 0], [0.05, h], legColor),
  P('boot', 'box', [s * x, boot[1] / 2, 0.05], boot, bootColor),
]);

/** 主人公と同じ形（アーチ形の体＝頭と胴、半ズボン、脚、モヒカン） */
const heroForm = (body, moh) => [
  ...LEGS(0.17, 0.5),
  P('shorts', 'box', [0, 0.72, 0], [0.8, 0.24, 0.62], C.heroShorts),
  P('body', 'cylinder', [0, 1.15, 0], [0.4, 0.62], body),
  P('head', 'sphere', [0, 1.46, 0], [0.4], body),
  P('mohawk', 'fan', [0, 1.72, 0], [0.6, 60, 0.12], moh),
];

const NAGA_SEGMENTS = Array.from({ length: 10 }, (_, i) => P(
  'segment', 'sphere',
  [1.55 - i * 0.36, 0.3 + 0.15 * Math.sin(i * 0.9), 0.2 * Math.sin(i * 0.6)],
  [0.24 - i * 0.008],
  C.heroBody,
));

export const CAST = Object.freeze([
  {
    id: 'dekaatama',
    name: 'デカ頭アリヌス',
    parts: [
      ...LEGS(0.13, 0.15, C.heroLeg, C.heroBoots, [0.16, 0.1, 0.24]),
      P('body', 'box', [0, 0.55, 0], [0.5, 0.6, 0.4], C.heroBody),
      ...S.map((s) => P('arm', 'cylinder', [s * 0.34, 0.6, 0], [0.05, 0.32], C.heroBody, { rot: [0, 0, s * 0.7] })),
      P('head', 'sphere', [0, 1.7, 0], [0.9], C.heroBody),
      P('mohawk', 'fan', [-0.35, 2.35, 0], [1.5, 110, 0.16], C.heroMohican, { rot: [0, 0, 0.65] }),
      FACE([0, 1.6, 0.9], [0.5, 0.38]),
      ...S.map((s) => P('brow', 'box', [s * 0.15, 1.88, 0.88], [0.18, 0.04, 0.04], C.faceInk, { rot: [0, 0, -s * 0.35] })),
    ],
    lines: [
      '頭が重くて、おじぎしたら3日起きられなかった。',
      'このモヒカン、風が吹くと島の反対側まで飛ばされるんだ……。',
      '帽子のサイズ？ 体育館って言われた。',
    ],
  },
  {
    id: 'tenohira',
    name: 'てのひらくん',
    parts: [
      P('palm', 'box', [0, 1.4, 0], [0.9, 1.0, 0.26], C.heroBody),
      ...[-0.38, -0.13, 0.13, 0.38].map((x, i) => P('finger', 'cylinder', [x, 2.15, 0], [0.09, 0.55], C.heroBody, { rot: [0, 0, [0.22, 0.07, -0.07, -0.22][i]] })),
      P('finger', 'cylinder', [0.6, 1.5, 0], [0.1, 0.45], C.heroBody, { rot: [0, 0, -1.0] }),
      FACE([0, 1.35, 0.14], [0.5, 0.38]),
    ],
    floating: true,
    lines: [
      'ハイタッチしよう！ ……あ、ぼく自身が手だった。',
      '手首から下？ 最初から無いよ。身軽でしょ。',
      'グー・チョキ・パー、全部ぼくひとりでできる。',
      'ビッグヌス？ 知らない人たちだよ。ぼくは通りすがりの手。',
    ],
  },
  {
    id: 'onasu',
    name: 'おなすくん',
    parts: [
      ...S.flatMap((s) => [
        P('leg', 'cylinder', [s * 0.2, 0.3, 0], [0.035, 0.5], C.castPurpleDark),
        P('foot', 'sphere', [s * 0.2, 0.06, 0.04], [0.08], C.heroBoots),
      ]),
      P('body', 'sphere', [0, 1.1, 0], [0.6], C.castPurple),
      P('body', 'sphere', [0, 1.7, 0], [0.42], C.castPurple),
      P('stem', 'cone', [0, 2.15, 0], [0.42, 0.3], C.leaf),
      P('stem', 'cylinder', [0, 2.4, 0], [0.06, 0.28], C.leaf),
      FACE([0, 1.15, 0.61], [0.5, 0.44], true),
      ...S.map((s) => P('arm', 'cylinder', [s * 0.68, 1.0, 0], [0.035, 0.55], C.castPurpleDark, { rot: [0, 0, s * 0.5] })),
      ...S.map((s) => P('hand', 'sphere', [s * 0.81, 0.76, 0], [0.07], C.castPurpleDark)),
    ],
    catchphrase: 'おなすだぁ〜いすき',
    lines: [
      'おなすだぁ〜いすき',
      '焼きなす、麻婆なす、そしてぼく。',
      'このヘタ、帽子じゃなくて本体なんだ。',
    ],
  },
  {
    id: 'mohifry',
    name: 'モヒフライ',
    parts: [
      P('body', 'sphere', [0, 0.45, 0], [0.3], C.castFry),
      P('body', 'cylinder', [0, 0.9, 0], [0.3, 0.9], C.castFry),
      P('body', 'sphere', [0, 1.35, 0], [0.3], C.castFry),
      ...[0.55, 0.7, 1.22].map((y) => P('stripe', 'box', [0, y, 0.27], [0.56, 0.05, 0.08], C.castFryDark, { rot: [0, 0, 0.45] })),
      ...S.map((s) => P('tail', 'cone', [s * 0.13, 1.75, 0], [0.13, 0.55], C.castOrange, { rot: [0, 0, -s * 0.45] })),
      FACE([0, 0.95, 0.31], [0.32, 0.24]),
      ...S.map((s) => P('limb', 'torus', [s * 0.38, 0.85, 0], [0.11, 0.035], C.castFryDark, { rot: [0, HP, 0] })),
      ...S.map((s) => P('limb', 'torus', [s * 0.15, 0.14, 0.05], [0.1, 0.035], C.castFryDark, { rot: [0, HP, 0] })),
      P('ribbon', 'box', [0, 1.45, 0.2], [0.36, 0.14, 0.06], C.castPink, { onlyForVariant: 'ribbon' }),
      P('ribbon', 'sphere', [0, 1.45, 0.24], [0.07], C.mohicanRed, { onlyForVariant: 'ribbon' }),
    ],
    crowd: { size: 6, ribbonCount: 1 },
    lines: [
      'サクサク行進中！ 列を乱すとソースをかけられるぞ。',
      'しっぽはモヒカン。衣はおしゃれ。',
      'タルタル派？ ソース派？ ……どっちも怖い！',
    ],
  },
  {
    id: 'mukimuki',
    name: 'ムキムキヌス',
    parts: [
      ...LEGS(0.3, 0.3, C.heroLeg, C.heroBoots, [0.32, 0.22, 0.5]),
      P('shorts', 'box', [0, 0.65, 0], [1.0, 0.3, 0.7], C.heroShorts),
      P('body', 'box', [0, 1.45, 0], [1.2, 1.4, 0.8], C.castPurple),
      ...[-0.3, 0, 0.3].map((x) => P('stripe', 'box', [x, 1.45, 0.41], [0.06, 1.2, 0.02], C.castPurpleDark)),
      P('head', 'sphere', [0, 2.3, 0], [0.25], C.heroBody),
      FACE([0, 2.28, 0.25], [0.26, 0.2]),
      ...S.map((s) => P('arm', 'cylinder', [s * 0.72, 1.35, 0], [0.09, 1.2], C.castPurple, { rot: [0, 0, s * 0.12] })),
      ...S.map((s) => P('hand', 'sphere', [s * 0.8, 0.7, 0], [0.2], C.heroBody)),
    ],
    lines: [
      '筋肉は裏切らない。でも頭は小さい。',
      '腕立て伏せ1万回！ ……の予定を立てた。',
      'この胴、じつは段ボールじゃないぞ。たぶん。',
    ],
  },
  {
    id: 'murasaki',
    name: 'ムラサキアリヌス',
    parts: [
      ...heroForm(C.castPurple, C.castPurpleDark),
      FACE([0, 1.12, 0.41], [0.34, 0.26]),
      ...S.map((s) => P('arm', 'torus', [s * 0.56, 1.15, 0.05], [0.15, 0.045], C.castPurple, { rot: [0, HP, 0] })),
    ],
    pose: 'arms-curl-bounce',
    rival: true,
    lines: [
      'フン、タクアリヌス！ モヒカンの数で勝負だ！',
      'ムラサキは高貴な色。つまりオレの勝ち。',
      'ぴょんぴょん跳ねてるのは、くやしいからじゃないぞ！',
    ],
  },
  {
    id: 'neko',
    name: 'ねこアリヌス',
    parts: [
      ...S.map((s) => P('foot', 'sphere', [s * 0.35, 0.15, 0.2], [0.2], C.leaf)),
      P('body', 'sphere', [0, 1.0, 0], [0.9], C.leaf),
      ...S.map((s) => P('ear', 'cone', [s * 0.5, 1.85, 0], [0.25, 0.45], C.leaf, { rot: [0, 0, -s * 0.3] })),
      FACE([0, 1.15, 0.9], [0.6, 0.5], true),
      ...S.flatMap((s) => [1.0, 1.08, 1.16].map((y) => P('whisker', 'box', [s * 0.62, y, 0.72], [0.5, 0.02, 0.02], C.faceInk, { rot: [0, 0, s * (y - 1.08) * 2] }))),
      P('arm', 'cylinder', [-0.88, 0.8, 0.1], [0.12, 0.55], C.leaf, { rot: [0, 0, -0.4] }),
      P('arm', 'cylinder', [0.95, 1.55, 0.1], [0.12, 0.6], C.leaf, { rot: [0, 0, -0.35], pose: 'paw-up' }),
      P('paw', 'sphere', [1.06, 1.88, 0.12], [0.17], C.castPink),
      P('tail', 'tube', [0, 0.4, -0.85], [0.08, 1.1], C.leaf, { rot: [-0.6, 0, 0] }),
    ],
    lines: [
      'にゃーん。……いや、アリヌスだった。',
      '肉球さわる？ 1回100モヒカンね。',
      '真っ暗な絵の中は、ねこの目でもよく見えないにゃ。',
    ],
  },
  {
    id: 'megane',
    name: 'メガネ星人',
    parts: [
      ...S.map((s) => P('leg', 'cylinder', [s * 0.3, 0.3, 0], [0.06, 0.3], C.heroBody)),
      ...S.map((s) => P('footclaw', 'cone', [s * 0.3, 0.08, 0.12], [0.12, 0.32], C.heroMohican, { rot: [HP, 0, 0] })),
      P('body', 'sphere', [0, 1.1, 0], [0.72], C.heroBody),
      FACE([0, 1.05, 0.73], [0.55, 0.45], true),
      ...S.map((s) => P('goggle', 'sphere', [s * 0.3, 1.95, 0.05], [0.3], C.castWhite)),
      ...S.map((s) => P('pupil', 'sphere', [s * 0.3, 1.97, 0.32], [0.11], C.faceInk)),
      ...S.flatMap((s) => [-1, 0, 1].map((k) => P('lash', 'box', [s * 0.3 + k * 0.13, 2.28 - Math.abs(k) * 0.04, 0.12], [0.03, 0.16, 0.03], C.faceInk, { rot: [0, 0, -k * 0.4] }))),
      ...S.map((s) => P('arm', 'cylinder', [s * 0.85, 1.55, 0], [0.07, 0.7], C.heroBody, { rot: [0, 0, -s * 0.5], pose: 'm-claws' })),
      ...S.flatMap((s) => [-1, 1].map((k) => P('claw', 'cone', [s * 1.02 + k * 0.08, 2.0, 0], [0.08, 0.3], C.heroMohican, { rot: [0, 0, -k * 0.25] }))),
    ],
    lines: [
      'チョキチョキ。地球のモヒカン、いただきに来た。',
      'このメガネ、度が強すぎて未来が見える。',
      'まつ毛は毎朝カールしてるんだ。',
    ],
  },
  {
    id: 'ashidake',
    name: 'あしだけ',
    parts: [
      ...LEGS(0.15, 0.45),
      P('shorts', 'box', [0, 0.68, 0], [0.6, 0.24, 0.32], C.heroShorts),
      P('disc', 'cylinder', [0, 1.3, 0], [0.55, 0.16], C.heroBody, { rot: [HP, 0, 0] }),
      FACE([0, 1.3, 0.09], [0.5, 0.4]),
    ],
    lines: [
      '体？ そんなものは置いてきた。',
      '走るのは速いよ。脚しかないからね。',
      '手が無いから、拍手は足でする。',
    ],
  },
  {
    id: 'manmaru',
    name: 'まんまるアリヌス親子',
    parts: [
      ...LEGS(0.22, 0.18, C.heroLeg, C.heroBoots, [0.16, 0.1, 0.24]),
      P('body', 'sphere', [0, 0.85, 0], [0.6], C.heroBody),
      P('mohawk', 'fan', [0, 1.3, 0], [0.55, 60, 0.1], C.heroMohican),
      FACE([0, 0.9, 0.61], [0.42, 0.32]),
      ...S.map((s) => P('arm', 'torus', [s * 0.66, 0.85, 0], [0.12, 0.035], C.heroBody, { rot: [0, HP, 0] })),
    ],
    family: [{ scale: 1 }, { scale: 0.55 }],
    lines: [
      'まんまる家の家訓：転がれるうちに転がれ。',
      'うちの子、ころころ育ってます。',
      '坂道は、ちょっとこわい。',
    ],
  },
  {
    id: 'futatsugao',
    name: 'ふたつがお',
    parts: [
      ...LEGS(0.18, 0.2),
      P('skirt', 'cone', [0, 0.7, 0], [0.75, 0.85], C.heroMohican),
      P('body', 'cylinder', [0, 1.3, 0], [0.42, 0.6], C.heroBody),
      P('head', 'sphere', [0, 1.6, 0], [0.42], C.heroBody),
      P('mohawk', 'fan', [0, 1.88, 0], [0.6, 60, 0.12], C.heroMohican),
      FACE([0, 1.58, 0.43], [0.32, 0.24]),
      FACE([0, 1.2, 0.43], [0.32, 0.24]),
      ...S.map((s) => P('arm', 'cylinder', [s * 0.5, 1.22, 0], [0.05, 0.5], C.heroBody, { rot: [0, 0, s * 0.4] })),
    ],
    lines: [
      '「こんにちは」「こんにちは」……二人ぶん言ってるよ。',
      'おなかの方の顔は、いつも腹ペコ。',
      'にらめっこ？ 自分と引き分けた。',
    ],
  },
  {
    id: 'tenshi',
    name: '天使アリヌス',
    parts: [
      ...LEGS(0.16, 0.4),
      P('body', 'cylinder', [0, 0.9, 0], [0.42, 0.76], C.castWhite),
      P('head', 'sphere', [0, 1.28, 0], [0.42], C.castWhite),
      P('halo', 'torus', [0, 1.95, 0], [0.3, 0.045], C.mohicanYellow, { rot: [HP, 0, 0] }),
      ...S.map((s) => P('wing', 'fan', [s * 0.3, 1.15, -0.38], [0.6, 80, 0.05], C.castWhite, { rot: [0, -s * 0.5, -s * 1.25] })),
      FACE([0, 1.0, 0.43], [0.34, 0.26]),
      ...S.map((s) => P('arm', 'cylinder', [s * 0.5, 0.95, 0], [0.045, 0.45], C.castWhite, { rot: [0, 0, s * 0.35] })),
    ],
    companion: {
      id: 'winged-mohawk',
      fly: true,
      parts: [
        P('mohawk', 'fan', [0, 0, 0], [0.32, 60, 0.08], C.heroMohican),
        P('wing', 'fan', [-0.16, 0.12, -0.02], [0.26, 80, 0.03], C.castWhite, { rot: [0, 0, 1.3] }),
        P('wing', 'fan', [0.16, 0.12, -0.02], [0.26, 80, 0.03], C.castWhite, { rot: [0, 0, -1.3] }),
      ],
    },
    lines: [
      'この子は羽の生えたモヒカン。散歩中なの。',
      '天使の輪は、じつはドーナツ。食べないでね。',
      '天国でもモヒカンは流行ってるよ。',
    ],
  },
  {
    id: 'tabako',
    name: 'タバコヌス',
    parts: [
      ...S.map((s) => P('boot', 'box', [s * 0.16, 0.08, 0.06], [0.18, 0.16, 0.3], C.heroBoots)),
      P('body', 'cylinder', [0, 1.05, 0], [0.4, 1.8], C.castWhite),
      P('filter', 'cylinder', [0, 2.25, 0], [0.41, 0.6], C.castOrange),
      ...[2.1, 2.28, 2.45].map((y) => P('filter-stripe', 'box', [0, y, 0.39], [0.5, 0.04, 0.05], C.heroBoots, { rot: [0, 0, 0.45] })),
      P('smoke', 'tube', [0, 2.6, 0], [0.07, 0.5], C.castGray),
      P('smoke', 'tube', [0.1, 3.05, 0], [0.06, 0.45], C.castGray),
      P('smoke', 'sphere', [-0.05, 3.55, 0], [0.12], C.castGray),
      FACE([0, 0.65, 0.41], [0.36, 0.28]),
      ...S.map((s) => P('arm', 'cylinder', [s * 0.46, 1.0, 0], [0.04, 0.45], C.castWhite, { rot: [0, 0, s * 0.3] })),
    ],
    sign: 'タバコのコスプレは20才になってから',
    lines: [
      'これはコスプレです。中身はただのアリヌスです。',
      '頭から出てるのは湯気。お風呂上がりなんだ。',
      '小説を一晩で書けって？ 煙に巻いてやる。',
    ],
  },
  {
    id: 'sankaku',
    name: 'さんかくアリヌス',
    parts: [
      ...LEGS(0.18, 0.15),
      P('body', 'cone', [0, 1.05, 0], [0.7, 1.6], C.heroBody),
      P('mohawk', 'cone', [0, 2.2, 0], [0.1, 0.9], C.heroMohican),
      FACE([0, 1.3, 0.31], [0.26, 0.2]),
      P('arm-cross', 'box', [0, 0.75, 0.5], [0.85, 0.1, 0.1], C.heroMohican, { rot: [0, 0, 0.35] }),
      P('arm-cross', 'box', [0, 0.75, 0.5], [0.85, 0.1, 0.1], C.heroMohican, { rot: [0, 0, -0.35] }),
    ],
    symbols: [{ text: '？', above: 'head' }],
    lines: [
      'うーん……三角形の内角の和って、モヒカン何本ぶん？',
      'けん玉の玉って、なんで丸いんだろう。三角でいいのに。',
      '考えすぎて、頭がとがってきた。',
    ],
  },
  {
    id: 'tofu',
    name: 'とうふアリヌス',
    parts: [
      ...LEGS(0.25, 0.25),
      P('shorts', 'box', [0, 0.5, 0], [0.9, 0.26, 0.7], C.heroShorts),
      P('body', 'box', [0, 1.15, 0], [1.0, 1.1, 0.8], C.castWhite),
      FACE([0, 1.2, 0.41], [0.5, 0.42], true),
      ...S.map((s) => P('arm', 'cylinder', [s * 0.6, 1.0, 0.05], [0.05, 0.38], C.castWhite, { rot: [0, 0, -s * 0.9], pose: 'hands-on-hips' })),
      ...S.map((s) => P('hand', 'sphere', [s * 0.52, 0.86, 0.05], [0.07], C.castWhite)),
    ],
    pose: 'hands-on-hips',
    catchphrase: 'とうふ大好き',
    lines: [
      'とうふ大好き',
      '角に頭をぶつけても平気。ぼくがとうふだから。',
      '絹ごし？ 木綿？ ……ぼくは寄せ。',
    ],
  },
  {
    id: 'nagamohi',
    name: 'ながモヒ',
    parts: [
      P('head', 'sphere', [1.9, 0.75, 0], [0.3], C.heroBody),
      FACE([1.9, 0.75, 0.31], [0.32, 0.24]),
      ...NAGA_SEGMENTS,
      P('hand', 'sphere', [1.62, 0.52, 0.3], [0.07], C.heroBody),
      P('hand', 'sphere', [2.12, 0.52, 0.26], [0.07], C.heroBody),
      P('mohawk', 'fan', [-1.95, 0.4, 0], [0.6, 90, 0.08], C.heroMohican, { rot: [0, 0, 0.9] }),
    ],
    lines: [
      'しっぽの先までモヒカン。それがながモヒの誇り。',
      'うなぎ？ ちがうちがう、ながいだけのアリヌス。',
      '体を全部見るには、カメラを3回まわしてね。',
    ],
  },
].map((c) => Object.freeze(c)));

/** 置き場所ごとのキャラ（id の配列） */
export const CAST_PLACEMENT = Object.freeze({
  hub: Object.freeze(['dekaatama', 'mohifry', 'onasu', 'tofu', 'neko']),
  gallery: Object.freeze(['tenohira', 'mukimuki', 'murasaki', 'megane', 'tabako', 'sankaku', 'tenshi', 'nagamohi',
    'ashidake', 'manmaru', 'futatsugao']),
});

export function getCast(id) {
  return CAST.find((c) => c.id === id);
}

/** ふざけた一言を1つ選ぶ */
export function pickLine(id, rng) {
  const c = getCast(id);
  if (!c) return '';
  return pick(rng, c.lines) ?? '';
}
