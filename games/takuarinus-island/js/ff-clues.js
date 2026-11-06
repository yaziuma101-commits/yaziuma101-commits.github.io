// 「ファイルを見つけろ」の手がかり：季節・判定・文言・プロパティ。three.js・DOM に依存しない。
const f = Object.freeze;

/** ゲームの中の「今日」 */
export const FF_NOW = f({ y: 1999, m: 10, d: 12 });
export const SEASON_LABELS = f({
  spring: '春', summer: '夏', autumn: '秋', winter: '冬',
});

const TYPE_LABELS = f({
  '.txt': 'テキスト文書',
  '.doc': '文書',
  '.bmp': 'ビットマップ画像',
  '.xls': '表計算シート',
  '.wav': 'サウンド',
  '.mid': 'MIDI シーケンス',
  '.exe': 'アプリケーション',
  '.ini': '構成設定',
  '.htm': 'ホームページ',
  '.lzh': '圧縮ファイル',
});

/** 拡張子 → 種類の表示名（空にならない） */
export function typeLabelOf(ext) {
  return TYPE_LABELS[ext] || `${String(ext || '').replace('.', '').toUpperCase() || '不明な'} ファイル`;
}

export function seasonOfMonth(m) {
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** {y,m} → 'YYYY-season'。1・2月は前の年の冬 */
export function seasonKeyOf(date) {
  const y = Number(date && date.y);
  const m = Number(date && date.m);
  const s = seasonOfMonth(m);
  return `${s === 'winter' && m <= 2 ? y - 1 : y}-${s}`;
}

export const ymdOf = (d) => d.y * 10000 + d.m * 100 + d.d;

/** 季節のキー → [[年, 月], …] */
export function seasonMonths(key) {
  const [ys, season] = String(key).split('-');
  const y = Number(ys);
  if (season === 'winter') return [[y, 12], [y + 1, 1], [y + 1, 2]];
  const start = { spring: 3, summer: 6, autumn: 9 }[season] || 3;
  return [[y, start], [y, start + 1], [y, start + 2]];
}

function clampNow(d) {
  if (ymdOf(d) <= ymdOf(FF_NOW)) return d;
  return { y: FF_NOW.y, m: FF_NOW.m, d: Math.min(d.d, FF_NOW.d) };
}

/** 季節の中の日付（今日より後にはしない） */
export function dateInSeason(rng, key) {
  const [y, m] = rng.pick(seasonMonths(key));
  return clampNow({ y, m, d: rng.int(1, 28) });
}

/** 今日までのでたらめな日付 */
export function randomPastDate(rng, fromYear = 1995) {
  const d = { y: rng.int(fromYear, FF_NOW.y), m: rng.int(1, 12), d: rng.int(1, 28) };
  if (ymdOf(d) > ymdOf(FF_NOW)) d.y -= 1;
  return d;
}

/** 手がかりの4項目それぞれに当てはまるか */
export function clueChecks(node, clue) {
  const n = node || {};
  const c = clue || {};
  return {
    name: n.base === c.title,
    ext: n.ext === c.ext,
    season: !!n.modified && seasonKeyOf(n.modified) === c.seasonKey,
    size: Number.isFinite(n.sizeKB) && Math.abs(n.sizeKB - c.approxKB) <= c.tolKB,
  };
}

/** 4項目すべてに当てはまるファイルか */
export function matchesClue(node, clue) {
  if (!node || node.kind !== 'file' || !clue) return false;
  return Object.values(clueChecks(node, clue)).every(Boolean);
}

/** 手がかりの文 */
export function describeClue(clue) {
  const c = clue || {};
  const when = c.yearsAgo === 1 ? '去年' : '今年';
  return `「${c.title}」。拡張子は ${c.ext}。${when}の${SEASON_LABELS[c.season] || '？'}に保存した。大きさは ${c.approxKB}KB くらい`;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** プロパティの小窓の中身 */
export function fileProperties(node) {
  const n = node || {};
  const d = n.modified || { y: 0, m: 0, d: 0 };
  return {
    name: n.name,
    typeLabel: n.typeLabel,
    sizeText: `${n.sizeKB}KB`,
    modifiedText: `${String(d.y).padStart(4, '0')}/${pad2(d.m)}/${pad2(d.d)}`,
    preview: n.preview,
  };
}
