// ボス・門・モヒカンのデータ。ボスを足すときはここにレコードを足す。
export const BOSSES = [
  {
    id: 'puzzle',
    name: 'パズル番長',
    gateAngleDeg: -90,
    implemented: true,
    mohican: { id: 'red', name: '赤いモヒカン', colorKey: 'mohicanRed' },
    dialogue: {
      intro: [
        'よく来たな、タクアリヌス！',
        'オレはパズル番長。箱を押すのが三度のメシより好きだ。',
        '3つの箱押しパズルを全部解けたら、赤いモヒカンをくれてやろう！',
      ],
      win: [
        'ぐぬぬ……見事だ！',
        '約束どおり、この赤いモヒカンを持っていけ！',
      ],
      after: [
        'また来たのか。パズルならいつでも相手になるぞ！',
      ],
    },
  },
  {
    id: 'race',
    name: 'レース番長',
    gateAngleDeg: 30,
    implemented: false,
    mohican: { id: 'yellow', name: '黄色いモヒカン', colorKey: 'mohicanYellow' },
    dialogue: {
      intro: [
        'ブォンブォン！ よく来たな、タクアリヌス！',
        'オレはレース番長。この島でいちばん速い男だ。',
        'カートで3周勝負だ。オレに勝てたら黄色いモヒカンをくれてやる！',
      ],
      win: [
        'くっ……オレが抜かれるとは！',
        '約束だ、この黄色いモヒカンを持っていけ！',
      ],
      after: ['また走りに来たのか。いつでも相手になるぞ！'],
    },
  },
  {
    id: 'fps',
    name: 'FPS番長',
    gateAngleDeg: 150,
    implemented: false,
    // id は保存データ・既存の規則との互換のため 'purple' のまま（見た目と名前は緑）
    mohican: { id: 'purple', name: '緑のモヒカン', colorKey: 'mohicanGreen' },
    dialogue: {
      intro: [
        'ヘイ、タクアリヌス！ オレはFPS番長。水鉄砲の腕なら島でいちばんだ。',
        '射撃場で勝負だ。クリックでマウスを固定して、物陰をうまく使えよ！',
        'オレをびしょぬれにできたら、緑のモヒカンをくれてやる！',
      ],
      win: [
        'うわっ、びしょびしょだ……オレの負けだ！',
        '約束どおり、この緑のモヒカンを持っていけ！',
      ],
      after: ['また撃ち合いに来たのか？ いつでも相手になるぜ！'],
    },
  },
];

export const MOHICAN_TOTAL = BOSSES.length;

export function findBoss(id, bosses = BOSSES) {
  return bosses.find((b) => b.id === id) || null;
}
