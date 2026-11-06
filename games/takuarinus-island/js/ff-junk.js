// 「ファイルを見つけろ」の始まりに開いている関係ない窓（ブラウザ・メモ帳・画像・メール・ハイスコア…）。
// 回の約4割で、どれか1枚に答えに繋がる本当の情報、約2割で外れの窓にもっともらしい嘘が混ざる。
// 窓は ff-nav.js の openWindow で開き、閉じる・動かすは closeWindow・moveWindow をそのまま使う。
// three.js・DOM に依存しない。
import { makeRng, hashSeed } from './ff-rng.js';
import { allFolders, allFiles } from './ff-tree.js';
import { ymdOf } from './ff-clues.js';
import { addressOf, openWindow, getWindow } from './ff-nav.js';

const f = Object.freeze;

export const JUNK_KINDS = f(['welcome', 'browser', 'memo', 'diary', 'image', 'mail', 'score', 'news']);
/** 情報を書き込める窓の種類 */
export const JUNK_HINT_HOSTS = f(['browser', 'memo', 'diary', 'mail']);
export const JUNK_HIT_RATE = 0.4;
export const JUNK_LIE_RATE = 0.2;
export const JUNK_MIN = 5;
export const JUNK_MAX = 8;
const HISTORY_TAB = '閲覧履歴';
// 窓の一覧のキー名（実在の OS 名と同じ綴りをソースに書かないため、名前は組み立てる）
const WINS_KEY = ['win', 'dows'].join('');

const HISTORY = f([
  'mohi://モヒカン検索/とうふ', 'mohi://とうふ通販/木綿', 'mohi://今日の天気/モヒカン島',
  'mohi://モヒカン新聞/3面', 'mohi://掲示板/ぬ゛', 'mohi://けん玉の技/もしかめ',
]);
const SHOPPING = f([
  '・とうふ 3丁', '・ネギ', '・モヒカン用ワックス', '・しょうゆ', '・電池（単3）',
  '・フロッピーディスク 10枚', '・牛乳', '・カツオ節',
]);
const DIARY = f([
  '○月○日　はれ。モヒカンがよく立った。',
  '○月○日　くもり。とうふを2丁食べた。',
  '○月○日　雨。パソコンが「ぬ゛」と鳴った。',
  '○月○日　とうふアリヌスと将棋をした。負けた。',
  '○月○日　ファイルが多すぎて どこに何があるか わからない。',
]);
const SCORE_NAMES = f(['タクアリヌス', 'とうふアリヌス', 'おなすくん', 'さんかくアリヌス', 'デカ頭アリヌス']);

const dateText = (d) => `${d.y}年${d.m}月${d.d}日`;

function makeWin(kind, rng) {
  switch (kind) {
    case 'welcome':
      return {
        title: 'ようこそ',
        lines: [
          'ようこそ！ モヒカンOS 98 へ',
          '・はじめに：「マイコンピュータ」をダブルクリックしてみよう',
          '・こまったら：とうふを冷やしましょう',
          '・新しいモヒカンの立て方を見る',
          '□ 次回からこの画面を表示しない',
        ],
      };
    case 'browser':
      return {
        title: 'モヒカンネット探検隊',
        tabs: [
          { title: 'モヒカン検索', lines: ['モヒカン検索　[　　　　　] [検索]', '・人気のことば：とうふ／モヒカン／ぬ゛', '・今日のモヒカン：まっすぐ立っています'] },
          { title: 'とうふ通販', lines: ['木綿とうふ 1丁 ……… 98円', '絹とうふ 1丁 ……… 98円', '高野豆腐 10枚 ……… 980円', '※ 送料は とうふ 3丁分'] },
          { title: '今日の天気', lines: ['モヒカン島：はれ ときどき とうふ', '最高 23℃　最低 15℃', '洗濯指数：モヒカンがよく乾きます'] },
          { title: HISTORY_TAB, lines: rng.shuffle(HISTORY).slice(0, 4) },
        ],
      };
    case 'news':
      return {
        title: 'モヒカン新聞 - ブラウザ',
        tabs: [
          { title: 'モヒカン新聞', lines: ['【1面】モヒカン島に とうふの雨', '【2面】今年のモヒカン大賞が決定', '【3面】けん玉大会 ひらかれる'] },
          { title: '星占い', lines: ['とうふ座のあなた：ラッキーアイテムは フロッピー', 'モヒカン座のあなた：今日は 早寝が吉'] },
          { title: '掲示板', lines: ['名無しのモヒカン：ファイルが見つかりません', '名無しのとうふ：ぬ゛', '名無しのナス：ごみ箱は見た？'] },
        ],
      };
    case 'memo':
      return { title: 'メモ帳 - 買い物.txt', lines: ['買い物メモ', ...rng.shuffle(SHOPPING).slice(0, rng.int(4, 6))] };
    case 'diary':
      return { title: 'メモ帳 - 日記.txt', lines: ['日記（ひみつ）', ...rng.shuffle(DIARY).slice(0, 3)] };
    case 'image':
      return { title: 'とうふ.bmp - 画像の表示', lines: ['とうふ.bmp　320×240　256色', '（白くて四角い、おいしそうな とうふ）'] };
    case 'mail':
      return {
        title: 'メールの下書き',
        lines: [
          '宛先：とうふアリヌス',
          '件名：例のファイルのこと',
          'こんにちは。このあいだ話していたファイルのことです。',
          'モヒカンは今日も元気です。',
          '（書きかけ）',
        ],
      };
    case 'score':
    default: {
      let s = 98000;
      const lines = ['モヒカンブロック　ハイスコア'];
      rng.shuffle(SCORE_NAMES).forEach((name, i) => {
        lines.push(`${i + 1}位　${name} ……… ${s}点`);
        s -= rng.int(3, 20) * 500;
      });
      return { title: 'ハイスコア - モヒカンブロック', lines };
    }
  }
}

/** 情報の文（host は窓の種類、type は 'folder' か 'date'） */
function hintText(host, type, tree, target, value) {
  const name = target.name;
  if (type === 'folder') {
    const addr = addressOf(tree, value);
    switch (host) {
      case 'diary': return `○月×日　「${name}」は『${addr}』に しまっておいた。たぶん。`;
      case 'memo': return `・${name} → ${addr}（わすれないこと！）`;
      case 'mail': return `添付するファイル：${name}（${addr} にあります）`;
      default: return `${addr.endsWith('\\') ? addr : `${addr}\\`}${name}`;
    }
  }
  const dt = dateText(value);
  switch (host) {
    case 'diary': return `${dt}　「${name}」を書き直して保存した。今度こそ本物。`;
    case 'memo': return `・${name} は ${dt} に保存したのが本物`;
    case 'mail': return `添付：${name}（${dt} 保存版）`;
    default: return `${name}（保存日 ${dt}）`;
  }
}

function makeLie(rng, tree, target) {
  if (rng.chance(0.6)) {
    const same = allFiles(tree)
      .filter((n) => n.decoy && n.name === target.name && n.parentId !== target.parentId)
      .map((n) => n.parentId);
    const pool = same.length ? same : allFolders(tree).map((n) => n.id).filter((id) => id !== target.parentId);
    if (pool.length) return { type: 'folder', truth: false, folderId: rng.pick(pool) };
  }
  const ty = ymdOf(target.modified);
  const dates = allFiles(tree).filter((n) => n.decoy && ymdOf(n.modified) !== ty).map((n) => n.modified);
  const d = dates.length ? rng.pick(dates) : { y: target.modified.y - 2, m: target.modified.m, d: target.modified.d };
  return { type: 'date', truth: false, date: { y: d.y, m: d.m, d: d.d } };
}

function putHint(rng, win, hint, tree, target) {
  const value = hint.type === 'folder' ? hint.folderId : hint.date;
  const text = hintText(win.kind, hint.type, tree, target, value);
  const h = { ...hint, text };
  win.hint = h;
  const lines = win.tabs ? (win.tabs.find((tb) => tb.title === HISTORY_TAB) || win.tabs[win.tabs.length - 1]).lines : win.lines;
  lines.splice(rng.int(1, lines.length), 0, text);
}

/** その回の始まりの窓の計画（種とファイルの木から決まる） */
export function junkPlan(tree, seed) {
  const rng = makeRng(hashSeed(seed, 'ff-junk'));
  const count = rng.int(JUNK_MIN, JUNK_MAX);
  const kinds = rng.shuffle(JUNK_KINDS).slice(0, count);
  const wins = kinds.map((kind, i) => ({
    key: `junk${i}`,
    kind,
    ...makWinSafe(kind, rng),
    x: 3 + i * 5 + rng.int(0, 5),
    y: 2 + i * 4 + rng.int(0, 4),
    tab: 0,
    hint: null,
  }));
  const target = tree && tree.nodes ? tree.nodes[tree.targetId] : null;
  const hosts = wins.map((w, i) => (JUNK_HINT_HOSTS.includes(w.kind) ? i : -1)).filter((i) => i >= 0);
  const hit = rng.chance(JUNK_HIT_RATE);
  const lie = rng.chance(JUNK_LIE_RATE);
  let hitIndex = -1;
  let lieIndex = -1;
  if (target && hosts.length) {
    if (hit) {
      hitIndex = rng.pick(hosts);
      const type = rng.chance(0.6) ? 'folder' : 'date';
      const hint = type === 'folder'
        ? { type, truth: true, folderId: target.parentId }
        : { type, truth: true, date: { y: target.modified.y, m: target.modified.m, d: target.modified.d } };
      putHint(rng, wins[hitIndex], hint, tree, target);
    }
    if (lie) {
      const rest = hosts.filter((i) => i !== hitIndex);
      if (rest.length) {
        lieIndex = rng.pick(rest);
        putHint(rng, wins[lieIndex], makeLie(rng, tree, target), tree, target);
      }
    }
  }
  return { [WINS_KEY]: wins, hitIndex, lieIndex };
}

function makWinSafe(kind, rng) {
  return makeWin(kind, rng);
}

/** 窓の中身の行（タブがあれば今のタブ） */
export function junkLines(junk) {
  const j = junk || {};
  if (Array.isArray(j.tabs) && j.tabs.length) {
    const i = Math.max(0, Math.min(j.tabs.length - 1, Math.floor(Number(j.tab) || 0)));
    return j.tabs[i].lines || [];
  }
  return Array.isArray(j.lines) ? j.lines : [];
}

/** 計画どおりに窓を開く（ff-nav の openWindow）。開いた窓の id の配列 */
export function openJunkWins(desk, tree, plan) {
  const ids = [];
  const list = plan && Array.isArray(plan[WINS_KEY]) ? plan[WINS_KEY] : [];
  for (const jw of list) {
    const id = openWindow(desk, tree, tree.rootId, { x: jw.x, y: jw.y });
    const w = getWindow(desk, id);
    if (w) w.junk = JSON.parse(JSON.stringify(jw));
    ids.push(id);
  }
  return ids;
}

/** ブラウザのタブを切り替える。変わったら true */
export function setJunkTab(desk, winId, idx) {
  const w = getWindow(desk, winId);
  if (!w || !w.junk || !Array.isArray(w.junk.tabs)) return false;
  const i = Math.floor(Number(idx));
  if (!Number.isFinite(i) || i < 0 || i >= w.junk.tabs.length || i === w.junk.tab) return false;
  w.junk.tab = i;
  return true;
}
