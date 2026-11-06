// 新しい絵18枚を、どのゲームのどこで使うかの表（three.js・DOM・Web Audio に依存しない）。
const f = Object.freeze;

export const DRAWINGS_PATH = 'textures/drawings/';

/** 依頼者が描いた新しい絵（public/textures/drawings/ に置いてある） */
export const NEW_DRAWING_FILES = f([
  'mohikan-nukitori.webp', 'inemuri-kart.webp', 'heya-no-sumi.webp', 'single.png',
  'nakimushi.webp', 'atama-poripori.webp', 'mohikan-motte.webp', 'akaruku-natta.webp',
  'taki.webp', 'chibimohi-to.webp', 'graffiti.webp', 'nakayoshi.webp', 'trump-card.webp',
  'kinniku-mohi.jpg', 'double.jpg', 'mohikan-chikazuku.webp', 'sankyoudai.webp', 'gogo.webp',
]);

/** ゲームごとに使う絵 */
export const GAME_DRAWINGS = f({
  'find-file': f(['graffiti.webp', 'nakayoshi.webp', 'trump-card.webp', 'taki.webp', 'atama-poripori.webp']),
  novel: f(['nakayoshi.webp', 'gogo.webp']),
  lever: f(['kinniku-mohi.jpg']),
  hub: f(['double.jpg', 'single.png']),
  'dark-soul': f(['heya-no-sumi.webp', 'nakimushi.webp', 'mohikan-chikazuku.webp', 'akaruku-natta.webp', 'mohikan-nukitori.webp']),
});

/** 絵の URL（index.html から見た相対パス） */
export function drawingPath(file) {
  return DRAWINGS_PATH + String(file || '');
}

/** ゲームの絵の一覧（未知は空） */
export function drawingsFor(game) {
  const list = Object.prototype.hasOwnProperty.call(GAME_DRAWINGS, game) ? GAME_DRAWINGS[game] : null;
  return list ? [...list] : [];
}

/** 文字列のハッシュ（FNV-1a） */
export function hashKey(key) {
  let h = 0x811c9dc5;
  for (const ch of String(key ?? '')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** キーから決まる絵を1枚（同じキーなら同じ絵）。絵が無いゲームは null */
export function pickDrawing(game, key) {
  const list = drawingsFor(game);
  if (!list.length) return null;
  return list[hashKey(key) % list.length];
}

/** 真っ暗ソウルでの絵の使い方（壁の額・近づく絵・電気が戻ったときの絵・天井の手・驚かせの顔） */
export const DS_DRAWING_ROLES = f({
  walls: f(['heya-no-sumi.webp', 'nakimushi.webp', 'mohikan-chikazuku.webp']),
  creep: 'mohikan-chikazuku.webp',
  power: 'akaruku-natta.webp',
  ceiling: 'mohikan-nukitori.webp',
  scareFaces: f({
    painting: 'mohikan-chikazuku.webp',
    basement: 'nakimushi.webp',
    dark: 'nakimushi.webp',
    lights: 'heya-no-sumi.webp',
  }),
});

/** 絵の id（'akaruku-natta'）→ 真っ暗ソウルの絵のファイル名。無ければ null */
export function dsDrawingFile(id) {
  const key = String(id || '');
  if (!key) return null;
  return GAME_DRAWINGS['dark-soul'].find((file) => file === key || file.startsWith(`${key}.`)) || null;
}
