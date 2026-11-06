// 英語対応（three.js に依存しない）。日本語の文は今までどおりコードに書き、表示するときに
// 対応表（i18n-table.js：日本語 → 英語）で置き換える。画面の文字は HTML で重ねているので、
// installDomTranslation がページの文字の変化を見張って置き換える（各場面のコードは変えない）。
// 3D の中に描く文字（看板）は translate() を通す。選んだ言語は保存し、「データを消す」でも残す。
import { I18N_TABLE } from './i18n-table.js';

export const LANG_STORAGE_KEY = 'takuarinus-lang-v1';
export const LANGS = Object.freeze(['ja', 'en']);
export const LANG_LABELS = Object.freeze({ ja: '言語: 日本語', en: 'Language: English' });

/** 日本語の文字（ひらがな・カタカナ・漢字・全角の記号） */
export const JA_CHAR = /[ぁ-ゖァ-ヺー㐀-鿿ｦ-ﾟ]/;

let lang = 'ja';

export function normalizeLang(v) {
  return LANGS.includes(v) ? v : 'ja';
}
export function getLang() {
  return lang;
}
export function loadLang(storage) {
  try {
    lang = normalizeLang(storage && storage.getItem(LANG_STORAGE_KEY));
  } catch {
    lang = 'ja';
  }
  return lang;
}
export function saveLang(storage, v) {
  lang = normalizeLang(v);
  try {
    if (storage) storage.setItem(LANG_STORAGE_KEY, lang);
  } catch { /* 握りつぶす */ }
  return lang;
}
/** 言語を直接決める（テスト用・切り替えの直後） */
export function useLang(v) {
  lang = normalizeLang(v);
  return lang;
}

// ---- 対応表の組み立て（{0} などの穴あきの文は正規表現にする） ----
const exact = new Map();
const patterns = [];
const escapeRe = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

function compile(table) {
  exact.clear();
  patterns.length = 0;
  for (const [ja, en] of Object.entries(table)) {
    if (typeof en !== 'string' || !en) continue;
    exact.set(ja, en);
    // HTML の断片は、タグの間の文字どうしも対応させる（画面には文字だけが入るため）
    if (ja.includes('<')) {
      const a = ja.split(/<[^>]*>/);
      const b = en.split(/<[^>]*>/);
      if (a.length === b.length) {
        a.forEach((s, i) => {
          const k = s.trim();
          if (k && JA_CHAR.test(k) && !exact.has(k) && b[i].trim()) exact.set(k, b[i].trim());
        });
      }
    }
    if (!/\{\d+\}/.test(ja)) continue;
    const order = [];
    const src = ja.split(/(\{\d+\})/).map((part) => {
      const m = /^\{(\d+)\}$/.exec(part);
      if (!m) return escapeRe(part).replace(/\{/g, '\\{').replace(/\}/g, '\\}');
      order.push(Number(m[1]));
      return '([\\s\\S]+?)';
    }).join('');
    // 穴だけの文（例: 「{0}」）より、決まった文字の多い文を先に試す
    const fixed = ja.replace(/\{\d+\}/g, '').length;
    if (fixed === 0) continue;
    patterns.push({ re: new RegExp(`^${src}$`), order, en, fixed });
  }
  patterns.sort((a, b) => b.fixed - a.fixed);
}
compile(I18N_TABLE);

const memo = new Map();
const SEPARATORS = /(\n|　| ／ |／| \/ |\s{2,})/;

function translateOne(text, depth) {
  if (!text || !JA_CHAR.test(text)) return text;
  if (exact.has(text)) return exact.get(text);
  const lead = text.match(/^\s*/)[0];
  const tail = text.match(/\s*$/)[0];
  const core = text.slice(lead.length, text.length - tail.length);
  if (core !== text && exact.has(core)) return lead + exact.get(core) + tail;
  if (depth > 4) return text;
  for (const p of patterns) {
    const m = p.re.exec(core);
    if (!m) continue;
    let out = p.en;
    p.order.forEach((n, i) => {
      out = out.replace(`{${n}}`, translateOne(m[i + 1], depth + 1));
    });
    return lead + out + tail;
  }
  // 「キー: 説明」の形（操作の説明）は、説明の側だけ置き換える
  const kv = /^([^:：]{1,24})[:：]\s*([\s\S]+)$/.exec(core);
  if (kv && JA_CHAR.test(kv[2])) {
    const right = translateOne(kv[2], depth + 1);
    const left = JA_CHAR.test(kv[1]) ? translateOne(kv[1], depth + 1) : kv[1];
    if (right !== kv[2]) return `${lead}${left}: ${right}${tail}`;
  }
  // 全角のかっこ・感嘆符を半角に直した文も、もとの形で引く（画面の文字が一度直されたあと）
  const fw = core.replace(/\(/g, '（').replace(/\)/g, '）');
  if (fw !== core && exact.has(fw)) return lead + exact.get(fw) + tail;
  // 区切り（改行・全角の空白・／）でつないだ文は、部分ごとに置き換える
  const parts = core.split(SEPARATORS);
  if (parts.length > 1) {
    const done = parts.map((s, i) => (i % 2 ? (s === '　' ? '  ' : s.replace('／', '/')) : translateOne(s, depth + 1)));
    return lead + done.join('') + tail;
  }
  return text;
}

/** 全角の記号（英語のときは半角に直す） */
const FULLWIDTH = /[　-〃「-』・！-｠]/;
const PUNCT = [
  [/[「『]/g, '"'], [/[」』]/g, '"'], [/（/g, '('], [/）/g, ')'], [/！/g, '!'], [/？/g, '?'], [/：/g, ': '],
  [/、/g, ', '], [/。/g, '. '], [/・/g, '·'], [/／/g, '/'], [/　/g, '  '],
  [/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)],
];
function asciiPunct(s) {
  if (!FULLWIDTH.test(s)) return s;
  return PUNCT.reduce((acc, [re, to]) => acc.replace(re, to), s);
}
/** 置き換える必要がある文字（日本語か全角の記号）を含むか */
function needsWork(s) {
  return JA_CHAR.test(s) || FULLWIDTH.test(s);
}

/** 日本語の文を、いまの言語に合わせて返す（日本語なら何もしない） */
export function translate(text) {
  if (lang !== 'en' || typeof text !== 'string') return text;
  if (memo.has(text)) return memo.get(text);
  const out = asciiPunct(translateOne(text, 0));
  if (memo.size > 4000) memo.clear();
  memo.set(text, out);
  return out;
}

/** 対応表の照合用: 英語に置き換えたあとも日本語が残るか */
export function untranslated(text) {
  const prev = lang;
  lang = 'en';
  try {
    return JA_CHAR.test(translateOne(text, 0));
  } finally {
    lang = prev;
  }
}

// ---- 画面（HTML）の文字を見張って置き換える ----
const ATTRS = ['title', 'placeholder', 'alt', 'aria-label'];

function translateTextNode(node) {
  const v = node.nodeValue;
  if (!v || !needsWork(v)) return;
  const t = translate(v);
  if (t !== v) node.nodeValue = t;
}
function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) {
    translateTextNode(root);
    return;
  }
  if (root.nodeType !== 1) return;
  const tag = root.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE') return;
  for (const a of ATTRS) {
    const v = root.getAttribute && root.getAttribute(a);
    if (v && needsWork(v)) root.setAttribute(a, translate(v));
  }
  for (const c of root.childNodes) translateTree(c);
}

let observer = null;
/** 英語のとき、ページの文字を置き換え続ける。日本語のときは何もしない */
export function installDomTranslation(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || lang !== 'en' || observer) return false;
  if (doc.documentElement) doc.documentElement.lang = 'en';
  if (doc.title) doc.title = translate(doc.title);
  translateTree(doc.body);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translateTextNode(r.target);
      else if (r.type === 'attributes') translateTree(r.target);
      else r.addedNodes.forEach((n) => translateTree(n));
    }
  });
  observer.observe(doc.body, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS,
  });
  return true;
}
