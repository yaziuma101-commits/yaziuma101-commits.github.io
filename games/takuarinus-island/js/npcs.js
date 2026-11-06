// ハブにいる仲間のデータと会話の規則（three.js・DOM に依存しない）
export const TALK_RADIUS = 2.5;

function at(deg, r) {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.cos(a), z: r * Math.sin(a) };
}
function toward(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

// 仲間はみんな広場の手前（主人公の出現位置あたり）を向く
const LOOK = { x: 0, z: 4 };
const P_SENPAI = at(-10, 7);
const P_CHIBI = at(75, 10);
const P_PETA = at(-170, 6);
const P_CHIBIMOHI = at(92, 11.5); // ちびアリヌスのとなり

export const NPCS = [
  {
    id: 'senpai',
    name: '先輩アリヌス',
    ...P_SENPAI,
    facing: toward(P_SENPAI, LOOK),
    radius: 0.9,
    shadow: 1.4,
    lines: [
      'よう、タクアリヌス。モヒカンは男の勲章だ。',
      'パズルの門の先に番長がいる。箱は押せても引けないぞ。',
      '行き詰まったら Z で1手戻せる。R で最初からだ。',
      'レースとFPSの門は、まだ工事中らしいな。',
    ],
    shape: { scale: 1.25, pose: 'hips' },
  },
  {
    id: 'chibi',
    name: 'ちびアリヌス',
    ...P_CHIBI,
    facing: toward(P_CHIBI, LOOK),
    radius: 0.6,
    shadow: 0.8,
    lines: [
      'ぼくもいつかモヒカン生えるかなあ。',
      '台座にモヒカンが3本そろうと、すごいことが起きる……らしいよ！',
      'Space でジャンプできるよ。ぴょーん！',
    ],
    shape: {
      scale: 0.6, profile: 'skirt', mohican: false, legs: false, armScale: 0.6, pose: 'rest',
    },
  },
  {
    id: 'peta',
    name: 'ぺたアリヌス',
    ...P_PETA,
    facing: toward(P_PETA, LOOK),
    radius: 1.3,
    shadow: 2.7,
    lines: [
      '……ぺたー。地面はひんやりして気持ちいいよ。',
      '踏まないでね……。',
      'カメラは Q と E でぐるっと回せるよ。ぺたー。',
    ],
    shape: { form: 'disc', mohican: false, arms: false, legs: false },
  },
  {
    id: 'chibimohi',
    name: 'ちびモヒ',
    ...P_CHIBIMOHI,
    facing: toward(P_CHIBIMOHI, LOOK),
    radius: 0.6,
    shadow: 0.8,
    lines: [
      'おおきくなったら、ぼくもモヒカン集めるんだ！',
      'このモヒカン、まだちっちゃいけど自慢なんだ。',
      'Shift を押しながら走ると、すっごく速いよ！',
    ],
    // モヒカンそのものが体。細い手足と小さなブーツ。顔は無い
    shape: {
      form: 'mohican', scale: 0.6, face: false, arms: true, legs: true, armScale: 1, pose: 'rest',
    },
  },
];

/** pos から radius 以内で一番近い仲間。いなければ null */
export function findTalkTarget(pos, npcs = NPCS, radius = TALK_RADIUS) {
  let best = null;
  let bestD = Infinity;
  for (const n of npcs) {
    const d = Math.hypot(pos.x - n.x, pos.z - n.z);
    if (d <= radius && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

export function lineAt(npc, count) {
  const n = npc.lines.length;
  if (!n) return '';
  return npc.lines[((count % n) + n) % n];
}

/** 話しかけるたびに lines を順番に巡回する。counts は {id: 回数} */
export function nextLine(counts, npc) {
  const c = counts[npc.id] || 0;
  counts[npc.id] = c + 1;
  return lineAt(npc, c);
}

/** カメラの回転入力。話せる相手がいるとき E は「話す」なので回転に使わない */
export function cameraTurn(qDown, eDown, canTalk) {
  return (qDown ? 1 : 0) - (eDown && !canTalk ? 1 : 0);
}
