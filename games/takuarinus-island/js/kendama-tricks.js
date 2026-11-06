// けん玉の技の定義と進行（three.js・DOM・Web Audio に依存しない）。
// 技の進行は {id, index, status}。status は 'running' | 'success' | 'failed'。

const f = Object.freeze;

const trick = (id, name, points, sequence) => f({
  id, name, points, sequence: f([...sequence]),
});

export const TRICK_IDS = f(['ookazara', 'kozara', 'chuuzara', 'tomeken', 'nihonisshuu', 'moshikame']);

export const TRICKS = f({
  ookazara: trick('ookazara', '大皿', 1, ['ookazara']),
  kozara: trick('kozara', '小皿', 2, ['kozara']),
  chuuzara: trick('chuuzara', '中皿', 3, ['chuuzara']),
  tomeken: trick('tomeken', 'とめけん', 5, ['kensaki']),
  nihonisshuu: trick('nihonisshuu', '日本一周', 8, ['ookazara', 'kozara', 'chuuzara']),
  moshikame: trick('moshikame', 'もしかめ', 10, ['ookazara', 'chuuzara', 'ookazara', 'chuuzara', 'ookazara']),
});

/** 皿の表示名 */
export const CUP_NAMES = f({
  ookazara: '大皿', kozara: '小皿', chuuzara: '中皿', kensaki: 'けん先',
});

/** 5ラウンドそれぞれの候補（徐々に難しくなる） */
export const ROUND_POOLS = f([
  f(['ookazara', 'kozara']),
  f(['kozara', 'chuuzara']),
  f(['chuuzara', 'tomeken']),
  f(['tomeken', 'nihonisshuu']),
  f(['nihonisshuu', 'moshikame']),
]);

const known = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(TRICKS, id);

export function trickPoints(id) {
  return known(id) ? TRICKS[id].points : 0;
}

export function startTrick(id) {
  return { id, index: 0, status: known(id) ? 'running' : 'failed' };
}

/** 皿で受けた。期待の皿なら進み、違えば失敗。終わった技は変えない */
export function catchCup(run, cup) {
  if (!run || run.status !== 'running' || !known(run.id)) return run;
  const seq = TRICKS[run.id].sequence;
  if (cup !== seq[run.index]) return { ...run, status: 'failed' };
  const index = run.index + 1;
  return { ...run, index, status: index >= seq.length ? 'success' : 'running' };
}

/** 外した（ズコー） */
export function missBall(run) {
  if (!run || run.status !== 'running') return run;
  return { ...run, status: 'failed' };
}

/** 次に必要な皿。終わっていれば null */
export function nextCup(run) {
  if (!run || run.status !== 'running' || !known(run.id)) return null;
  return TRICKS[run.id].sequence[run.index] ?? null;
}

// ---- 種から 0〜1（murmur3 の fmix32） ----
function fmix32(h0) {
  let h = h0 >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function partHash(p) {
  if (typeof p === 'number' && Number.isFinite(p)) return Math.floor(p) >>> 0;
  let h = 2166136261;
  for (const c of String(p)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h;
}

/** (seed, ...parts) から決まる 0〜1 未満の値。連番の種でも一様に散る */
export function hashUnit(seed, ...parts) {
  const s = Math.floor(Number(seed));
  let h = fmix32(((Number.isFinite(s) ? s : 0) >>> 0) ^ 0x9e3779b9);
  for (const p of parts) h = fmix32((h ^ Math.imul(partHash(p) + 1, 0x27d4eb2d)) >>> 0);
  return h / 4294967296;
}

/** 5ラウンド分の技 id。主人公と相手は同じラウンドで同じ技に挑む */
export function makeSchedule(seed) {
  return ROUND_POOLS.map((pool, i) => pool[Math.min(pool.length - 1, Math.floor(hashUnit(seed, 'round', i) * pool.length))]);
}
