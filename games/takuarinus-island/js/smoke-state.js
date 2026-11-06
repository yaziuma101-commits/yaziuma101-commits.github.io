// 試し遊び用の state() の中身の検査（three.js・DOM に依存しない）。
// 試し遊びは場面に入った直後と操作の後に window.__smoke.state() を読み、problems を報告する。

/** ゲームの場面が smokeState() で必ず返すキー（無い・NaN なら食い違い） */
export const SMOKE_STATE_KEYS = Object.freeze({
  'minigame@puzzle': ['phase', 'level', 'moves'],
  'minigame@race': ['phase', 'lap', 'speed'],
  'minigame@fps': ['phase', 'bossHp', 'playerHp'],
  touch: ['phase'],
  stack: ['phase'],
  shogi: ['phase'],
  kendama: ['phase'],
  novel: ['phase'],
  findfile: ['phase'],
  leverfighter: ['phase'],
  darksoul: ['phase'],
  kaijuBattle: ['phase'],
});

/** 数の値のうち NaN・Infinity の場所（'a.b' の形） */
export function badNumbers(v, at = '', out = [], depth = 0) {
  if (depth > 4 || out.length > 10) return out;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(at || '(値)');
  } else if (Array.isArray(v)) {
    v.slice(0, 20).forEach((x, i) => badNumbers(x, `${at}[${i}]`, out, depth + 1));
  } else if (v && typeof v === 'object') {
    for (const k of Object.keys(v).slice(0, 40)) badNumbers(v[k], at ? `${at}.${k}` : k, out, depth + 1);
  }
  return out;
}

/** 場面名（'minigame@race' のような名前も）と、場面の smokeState() の結果から食い違いを返す */
export function smokeProblems(name, game) {
  const need = SMOKE_STATE_KEYS[name];
  const out = [];
  if (need) {
    if (!game || typeof game !== 'object') return [`${name} が smokeState() を返さない`];
    for (const k of need) {
      if (!(k in game) || game[k] === undefined || game[k] === null) out.push(`${name} の state に ${k} が無い`);
    }
  }
  for (const at of badNumbers(game)) out.push(`${name} の state.${at} が数でない（NaN／Infinity）`);
  if (game && Array.isArray(game.problems)) out.push(...game.problems.map(String));
  return out;
}

/** 試し遊び用の要約: 上の段の数・文字・真偽だけ（three.js の物や関数は入れない。最大16個） */
export function smokeSummary(obj) {
  if (!obj || typeof obj !== 'object') return obj === undefined ? null : obj;
  const out = {};
  let n = 0;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40)) {
      out[k] = v;
      if (++n >= 16) break;
    }
  }
  return out;
}
