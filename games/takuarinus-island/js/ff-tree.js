// 「ファイルを見つけろ」のファイルの木。種から作る。three.js・DOM に依存しない。
import { makeRng, hashSeed } from './ff-rng.js';
import {
  FF_NOW, seasonKeyOf, typeLabelOf, dateInSeason, randomPastDate,
} from './ff-clues.js';

const f = Object.freeze;

/** 手がかりの名前の候補 */
export const CLUE_TITLES = f([
  'とうふのレシピ', 'モヒカンの手入れ', '年賀状の下書き', 'とうふアリヌスの日記', '夏休みの宿題',
  'ゲームの攻略メモ', '冷ややっこの研究', 'タクアリヌスの似顔絵', '厚揚げの作り方', '湯豆腐の思い出',
  '麻婆豆腐の秘伝', 'がんもどきの歌', '島の地図', '秘密の作戦', '運動会の写真',
  '卒業文集', 'おこづかい帳', 'カレーの作り方', 'ラーメン屋の一覧', 'モヒカンの歴史',
  'ナスの育て方', 'けん玉の技一覧', '将棋の定跡', '小説の下書き', 'カートの設計図',
  '水鉄砲の改造', '倉庫番の解き方', '豆乳の飲み比べ', '高野豆腐の観察', '油揚げの詩',
  'とうふ屋の時間割', 'ちゃぶ台の修理',
]);

/** 拡張子 → [大きさの下限, 上限, 紛らわしい別の拡張子] */
const CLUE_EXTS = f({
  '.txt': [3, 20, '.doc'],
  '.doc': [10, 80, '.txt'],
  '.bmp': [30, 400, '.txt'],
  '.xls': [8, 60, '.txt'],
  '.wav': [50, 600, '.txt'],
});

const FOLDER_NAMES = f([
  'マイドキュメント', '写真', 'ゲーム', '仕事', 'とうふ研究', 'モヒカン', '音楽', 'ダウンロード',
  '古いもの', '整理中', '未整理', 'バックアップ', '2学期', '年賀状', '壁紙', '日記帳',
  'レシピ集', '宿題', 'おまけ', '設定', 'システム', '一時', '新しいフォルダ', '新しいフォルダ (2)',
  '秘密', '見ないで', 'アルバム', '名簿', 'かくれが', '趣味', '旅行', '買い物',
]);

const FILLER_BASES = f([
  'メモ', '日記', '買い物リスト', '年賀状の住所', '壁紙', 'readme', 'setup', '議事録',
  '見積書', '請求書', '時間割', '住所録', 'カラオケの曲', 'セーブデータ', 'ラジオ体操', '部活の予定',
  '落書き', '旅行の写真', 'おみくじ', '漢字テスト', '占い', '天気', '作文', '時刻表',
  '献立', '誕生日', 'けいさん', 'ポエム', 'うた', 'ログ', '一覧', '下書き',
  '新規テキスト', 'アイコン', '効果音', '起動', 'ドライバ', 'お知らせ', '連絡網', 'まとめ',
]);
const FILLER_EXTS = f(['.txt', '.doc', '.bmp', '.xls', '.wav', '.mid', '.exe', '.ini', '.htm', '.lzh']);

const TEXT_LINES = f([
  '・材料をそろえる。木綿か絹かは気分で決める。',
  '・あとで清書すること！！',
  '・これは大事。消さないで。',
  '・つづきは明日書く。',
  '・とうふアリヌスに見せる前に直す。',
  '・なんて書こうとしたか忘れた。',
]);

function previewFor(rng, s) {
  switch (s.ext) {
    case '.bmp': return rng.pick(['[画像] 白くて四角いものが写っている', '[画像] ぼやけたモヒカンの写真', '[画像] 何かの落書き']);
    case '.wav':
    case '.mid': return rng.pick(['♪ 再生すると「ぬ゛」と鳴る', '♪ ピロリロリ…（音が出ます）', '♪ ドンドコドン']);
    case '.xls': return 'A1:品目　B1:数　C1:メモ\nA2:とうふ　B2:3　C2:木綿';
    case '.exe': return '（アプリケーションです。中身は読めません）';
    case '.lzh': return '（圧縮されています。中身は読めません）';
    case '.ini': return '[設定]\nモヒカン=立てる\nとうふ=冷やす';
    default: return `${s.base}\n${rng.pick(TEXT_LINES)}`;
  }
}

/** 種からファイルの木を作る */
export function generateTree(seed) {
  const rng = makeRng(hashSeed(seed, 'ff-tree'));
  const nodes = {
    root: {
      id: 'root', parentId: null, kind: 'root', name: 'マイコンピュータ', children: [],
    },
  };
  const depth = { root: 0 };
  const slots = {};
  let nid = 0;
  const addNode = (parentId, data) => {
    const id = `n${++nid}`;
    const n = { id, parentId, ...data };
    nodes[id] = n;
    nodes[parentId].children.push(id);
    return n;
  };
  const addFolder = (parentId, kind, name, subs) => {
    const n = addNode(parentId, { kind, name, children: [] });
    depth[n.id] = depth[parentId] + 1;
    slots[n.id] = Math.max(6, subs + rng.int(3, 7)) - subs;
    return n;
  };

  // フォルダの骨組み（ドライブ=1、最深=4）
  const leaves3 = [];
  const leaves4 = [];
  const driveCount = rng.int(2, 3);
  for (let di = 0; di < driveCount; di++) {
    const s1 = rng.int(3, 4);
    const drive = addFolder('root', 'drive', `${'CDE'[di]}:`, s1);
    rng.shuffle(FOLDER_NAMES).slice(0, s1).forEach((name1, i1) => {
      const s2 = rng.int(2, 3);
      const f2 = addFolder(drive.id, 'folder', name1, s2);
      rng.shuffle(FOLDER_NAMES).slice(0, s2).forEach((name2, i2) => {
        let s3 = rng.int(0, 2);
        if (di === 0 && i1 === 0) s3 = i2 === 0 ? 0 : Math.max(1, s3);
        const f3 = addFolder(f2.id, 'folder', name2, s3);
        if (s3 === 0) leaves3.push(f3.id);
        rng.shuffle(FOLDER_NAMES).slice(0, s3).forEach((name3) => {
          leaves4.push(addFolder(f3.id, 'folder', name3, 0).id);
        });
      });
    });
  }

  // 目的のファイルと手がかり
  const targetDepth = rng.chance(0.5) ? 3 : 4;
  const targetFolder = rng.pick(targetDepth === 3 ? leaves3 : leaves4);
  const title = rng.pick(CLUE_TITLES);
  const ext = rng.pick(Object.keys(CLUE_EXTS));
  const [lo, hi, altExt] = CLUE_EXTS[ext];
  const yearsAgo = rng.chance(0.6) ? 1 : 0;
  const season = yearsAgo === 0 ? rng.pick(['spring', 'summer']) : rng.pick(['spring', 'summer', 'autumn', 'winter']);
  const seasonKey = `${FF_NOW.y - yearsAgo}-${season}`;
  const approxKB = rng.int(lo, hi);
  const clue = {
    title, ext, yearsAgo, season, seasonKey, approxKB, tolKB: 1,
  };

  const near = () => Math.max(1, approxKB + rng.int(-1, 1));
  const far = () => {
    const k = rng.int(2, 5);
    return approxKB - k >= 1 && rng.chance(0.5) ? approxKB - k : approxKB + k;
  };
  const inSeason = () => dateInSeason(rng, seasonKey);
  const offSeason = () => {
    for (let i = 0; i < 40; i++) {
      const dt = randomPastDate(rng);
      if (seasonKeyOf(dt) !== seasonKey) return dt;
    }
    return dateInSeason(rng, `${FF_NOW.y - 3}-${season}`);
  };
  const otherYear = () => dateInSeason(rng, `${FF_NOW.y - yearsAgo - 1}-${season}`);

  const pending = {};
  const put = (folderId, spec) => { (pending[folderId] ||= []).push(spec); };
  const others = rng.shuffle(Object.keys(slots).filter((id) => id !== targetFolder));
  const [F1, F2, F3] = others;
  put(targetFolder, {
    base: title, ext, sizeKB: near(), modified: inSeason(), decoy: false, target: true,
  });
  put(targetFolder, { base: `${title}(1)`, ext, sizeKB: near(), modified: inSeason(), decoy: true });
  put(targetFolder, { base: `${title}_最終`, ext, sizeKB: far(), modified: inSeason(), decoy: true });
  put(targetFolder, { base: title, ext: altExt, sizeKB: near(), modified: inSeason(), decoy: true });
  put(rng.pick([targetFolder, F1, F2, F3]), {
    base: `${title}_最終_本当に最終`, ext, sizeKB: near(), modified: rng.chance(0.5) ? inSeason() : offSeason(), decoy: true,
  });
  put(F1, { base: title, ext, sizeKB: far(), modified: offSeason(), decoy: true });
  put(F2, { base: title, ext, sizeKB: far(), modified: inSeason(), decoy: true });
  put(F3, { base: title, ext, sizeKB: near(), modified: otherYear(), decoy: true });
  put(rng.pick(others.slice(3, 12)), { base: `コピー ～ ${title}`, ext, sizeKB: near(), modified: inSeason(), decoy: true });

  // ファイルを並べる（フォルダの後ろ）
  let targetId = null;
  for (const folderId of Object.keys(slots)) {
    const specs = pending[folderId] || [];
    const used = new Set(nodes[folderId].children.map((c) => nodes[c].name));
    for (const s of specs) used.add(s.base + s.ext);
    const list = [...specs];
    const fill = Math.max(0, slots[folderId] - specs.length);
    for (let i = 0; i < fill; i++) {
      const base = rng.pick(FILLER_BASES);
      const e = rng.pick(FILLER_EXTS);
      let b = base;
      let k = 2;
      while (used.has(b + e)) b = `${base}${k++}`;
      used.add(b + e);
      list.push({
        base: b, ext: e, sizeKB: rng.int(1, 640), modified: randomPastDate(rng), decoy: false,
      });
    }
    for (const s of rng.shuffle(list)) {
      const n = addNode(folderId, {
        kind: 'file',
        name: s.base + s.ext,
        base: s.base,
        ext: s.ext,
        sizeKB: s.sizeKB,
        modified: { y: s.modified.y, m: s.modified.m, d: s.modified.d },
        typeLabel: typeLabelOf(s.ext),
        preview: previewFor(rng, s),
        decoy: !!s.decoy,
      });
      if (s.target) targetId = n.id;
    }
  }

  return {
    rootId: 'root', nodes, targetId, clue, targetDepth,
  };
}

/** 子のノード（フォルダが先、ファイルが後） */
export function childrenOf(tree, id) {
  const n = tree && tree.nodes ? tree.nodes[id] : null;
  if (!n || !Array.isArray(n.children)) return [];
  const kids = n.children.map((c) => tree.nodes[c]).filter(Boolean);
  return [...kids.filter((k) => k.kind !== 'file'), ...kids.filter((k) => k.kind === 'file')];
}

/** root=0、ドライブ=1 */
export function depthOf(tree, id) {
  let d = 0;
  let n = tree.nodes[id];
  while (n && n.parentId) {
    d++;
    n = tree.nodes[n.parentId];
  }
  return d;
}

/** root を除く祖先から自身まで */
export function pathOf(tree, id) {
  const out = [];
  let n = tree.nodes[id];
  while (n && n.kind !== 'root') {
    out.unshift(n);
    n = tree.nodes[n.parentId];
  }
  return out;
}

export function allFiles(tree) {
  return Object.values(tree.nodes).filter((n) => n.kind === 'file');
}

export function allFolders(tree) {
  return Object.values(tree.nodes).filter((n) => n.kind === 'drive' || n.kind === 'folder');
}

/** おとりを1つ消した新しい木（元は変えない） */
export function removeDecoy(tree, seed) {
  const ids = allFiles(tree).filter((n) => n.decoy).map((n) => n.id).sort();
  if (!ids.length) return tree;
  const out = JSON.parse(JSON.stringify(tree));
  const id = ids[makeRng(hashSeed(seed, 'decoy', ids.length)).int(0, ids.length - 1)];
  const p = out.nodes[out.nodes[id].parentId];
  if (p && Array.isArray(p.children)) p.children = p.children.filter((c) => c !== id);
  delete out.nodes[id];
  return out;
}
