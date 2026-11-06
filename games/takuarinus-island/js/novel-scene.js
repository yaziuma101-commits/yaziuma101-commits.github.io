// 小説一夜漬けチキンレースの場面（HTML だけで描く夜の勉強部屋）。
import { paginate } from './novel-pages.js';
import { createQuestionState, buzzIn, answerQuestion, timeoutQuestion, outcomeText } from './novel-rules.js';
import {
  createNovelMatch, currentQuestion, applyQuestionResult, isFinished, novelResult, novelResultView,
} from './novel-match.js';
import {
  planAiBuzz, aiAnswerAfterWrong, pagesReadAt, aiBuzzReady,
} from './novel-ai.js';
import {
  createReader, tickReader, nextPage, prevPage, bookmarkJump,
} from './novel-reader.js';
import { planGimmick, buildDeck, upsideDownActive, buzzSequence } from './novel-gimmicks.js';
import { loadSillyLevel, SILLY_STORAGE_KEY } from './silly-rules.js';

function readNovelSilliness() {
  try { return loadSillyLevel(globalThis.localStorage.getItem(SILLY_STORAGE_KEY)); } catch { return 2; }
}

export const NOVEL_TITLE = '小説一夜漬けチキンレース';

/** 紹介の画面の中身（文字だけ） */
export function novelIntroView(carryLine = '') {
  return {
    title: NOVEL_TITLE,
    lines: [
      '明日はテスト！ タバコヌスと小説をパラ読みして、問題に先に答えたほうが勝ち。',
      '問題はずっと上に出ている。小説のページは → キーかクリックで自分でめくる（← で戻る）。分かったら早押し！',
      '早く押すほど高得点。まちがえると減点で相手の番になる。待ちすぎると先に答えられる＝チキンレース。',
    ],
    rows: [
      ['Space', '早押し（めくりが止まり4択が出る）'],
      ['1〜4 / クリック', '答えを選ぶ'],
      ['→ / クリック', '次のページをめくる'],
      ['←', '前のページに戻る'],
      ['Esc', 'ポーズ（館に戻る）'],
    ],
    win: '勝ち方：小説2本・6問の合計点が多いほうの勝ち。',
    carry: typeof carryLine === 'string' && carryLine ? carryLine : '持ち込み：なし',
    note: 'Enter / Space で始める　Esc で館に戻る',
  };
}
import { extraSfx, ensureGameMusic, stopGameMusic } from './audio.js';
import { novelItemOptions, novelPageSpeed, novelScoreMul } from './item-effects.js';
import {
  el, addStyle, createMenu, sillyLevel, carryInfo, toGallery, grantItem, grantedLine,
} from './phase4-ui.js';
import { smokeSummary } from './smoke-state.js';

const GAME_ID = 'novel-chicken';

const CSS = `
#novel-root{position:fixed;inset:0;z-index:5;background:linear-gradient(var(--p-uiShade),var(--p-fade));color:var(--p-uiText);font-size:18px}
.nv-shelf{position:absolute;left:2%;top:8%;width:18%;height:60%;border:6px solid var(--p-heroBoots);background:repeating-linear-gradient(var(--p-heroBoots) 0 6px,var(--p-mohicanRed) 6px 30px,var(--p-mohicanGreen) 30px 54px,var(--p-heroBoots) 54px 60px)}
.nv-lamp{position:absolute;right:6%;top:12%;width:90px;height:60px;border-radius:50% 50% 0 0;background:var(--p-mohicanYellow);box-shadow:0 40px 120px var(--p-mohicanYellow)}
.nv-desk{position:absolute;left:0;right:0;bottom:0;height:22%;background:var(--p-heroBoots)}
.nv-hero,.nv-tabako{position:absolute;bottom:20%;width:70px;height:90px;border-radius:40px 40px 10px 10px}
.nv-hero{left:6%;background:var(--p-heroBody)}
.nv-tabako{right:6%;background:var(--p-mohicanGreen)}
.nv-bubble{position:absolute;right:8%;bottom:40%;width:18px;height:18px;border-radius:50%;border:2px solid var(--p-checkerLight);animation:nv-up 3s linear infinite}
@keyframes nv-up{0%{transform:translate(0,0);opacity:1}100%{transform:translate(-40px,-160px);opacity:0}}
.nv-q{position:absolute;left:50%;top:10px;transform:translateX(-50%);width:min(760px,90vw);padding:8px 16px;background:var(--p-uiPanel);border:3px solid var(--p-uiAccent);border-radius:12px;font-weight:bold;text-align:center}
.nv-q.big{top:30%;font-size:26px}
.nv-page{position:absolute;left:50%;top:22%;transform:translateX(-50%);width:min(620px,62vw);min-height:200px;padding:18px 24px;background:var(--p-checkerLight);color:var(--p-uiShade);border:4px solid var(--p-uiShade);border-radius:6px;line-height:1.8;transition:transform .2s}
.nv-page.upside{transform:translateX(-50%) rotate(180deg)}
.nv-page.filler{font-size:28px;text-align:center;font-weight:bold}
.nv-page.shake{animation:nv-shake .12s linear infinite}
@keyframes nv-shake{0%{margin-left:-2px}50%{margin-left:2px}100%{margin-left:-2px}}
.nv-info{position:absolute;left:50%;bottom:24%;transform:translateX(-50%);font-size:14px;padding:2px 10px;background:var(--p-uiPanel);border-radius:8px;white-space:nowrap}
.nv-score{position:absolute;right:12px;top:60px;padding:4px 12px;background:var(--p-uiPanel);border:3px solid var(--p-uiAccent);border-radius:12px;font-weight:bold}
.nv-choices{position:absolute;left:50%;bottom:2%;transform:translateX(-50%);display:grid;grid-template-columns:1fr 1fr;gap:6px;width:min(700px,92vw);list-style:none;margin:0;padding:0}
.nv-choices li{padding:8px 12px;background:var(--p-uiPanel);border:3px solid var(--p-uiShade);border-radius:10px;font-weight:bold;cursor:pointer}
.nv-choices li.off{opacity:.35;cursor:default}
.nv-choices li.right{border-color:var(--p-mohicanGreen)}
.nv-choices li.wrong{border-color:var(--p-mohicanRed);text-decoration:line-through}
`;

export function createNovelScene(ctxArg = {}) {
  let ctx = ctxArg;
  let root = null; let qEl; let pageEl; let infoEl; let scoreEl; let choicesEl; let lis = []; let msgEl = null;
  const pressed = new Set();
  let phase = 'howto'; let menu = null; let guard = 0; let paused = false; let msgT = 0;
  let match; let seed; let opts; let carryLine = ''; let silliness = 2;
  let cur; let pages; let gim; let deck; let reader; let qs; let ai; let aiBuzzAt; let speed; let mul;
  let clock = 0; let sub = 'intro'; let subT = 0; let hidden = new Set(); let shownPage = -1; let shownSec = 0;
  let bookmarkUsed = false; let elimUsed = false; let pendingSounds = []; let gimUsed = false;

  const onDown = (e) => {
    if (!root || e.repeat) return;
    if (['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    pressed.add(e.code);
  };

  function flash(text, sec = 1.2) {
    if (msgEl) msgEl.remove();
    msgEl = el('div', 'p4-msg', text);
    root.appendChild(msgEl);
    msgT = Math.min(2, sec);
  }

  function buzzSound() {
    const seq = !gimUsed ? buzzSequence(gim) : [{ sound: 'buzz', at: 0 }];
    if (seq.length > 1) { gimUsed = true; flash('ブッブー！？', 0.6); }
    for (const s of seq) pendingSounds.push({ name: s.sound === 'fakeBuzz' ? 'fakeBuzz' : 'pinpon', at: s.at });
  }

  function realPage() { return deck[reader.furthest] ? deck[reader.furthest].realPage : 1; }

  function renderScore() { scoreEl.textContent = `あなた ${match.scores.hero} − ${match.scores.ally} タバコヌス`; }

  function renderChoices(show) {
    choicesEl.classList.toggle('hidden', !show);
    lis.forEach((li, i) => {
      li.textContent = `${i + 1}. ${cur.question.choices[i]}`;
      li.classList.toggle('off', qs.excluded.includes(i) || hidden.has(i));
      li.classList.toggle('wrong', qs.excluded.includes(i));
    });
  }

  function renderPage() {
    const entry = deck[reader.page];
    if (!entry) return;
    if (reader.page !== shownPage) {
      if (shownPage >= 0) extraSfx('pera');
      shownPage = reader.page; shownSec = 0;
      pageEl.textContent = entry.text;
    }
    pageEl.classList.toggle('filler', entry.kind === 'filler');
    pageEl.classList.toggle('upside', upsideDownActive(entry, shownSec, gim));
    pageEl.classList.toggle('shake', opts.textShake);
    pageEl.style.fontSize = `${Math.round(18 * opts.fontScale)}px`;
    const tips = [];
    if (opts.bookmark && !bookmarkUsed) tips.push('B しおり');
    if (opts.eliminateOne && !elimUsed) tips.push('E 誤答を1つ消す');
    infoEl.textContent = `『${cur.story.title}』 ページ ${reader.page + 1}/${deck.length}　Space 早押し　← → めくる　${tips.join('　')}`;
  }

  function startQuestion() {
    cur = currentQuestion(match);
    if (!cur) { finish(); return; }
    pages = paginate(cur.story.text);
    gim = planGimmick({
      seed, questionNumber: cur.number, silliness, totalPages: pages.length,
    });
    gimUsed = false;
    deck = buildDeck(pages, gim);
    reader = createReader(deck.length);
    qs = createQuestionState();
    ai = planAiBuzz({
      seed, questionNumber: cur.number, strength: match.strength, totalPages: pages.length, question: cur.question,
    });
    aiBuzzAt = ai.buzzTime + opts.aiDelay;
    speed = novelPageSpeed(opts, seed, cur.number);
    mul = novelScoreMul(opts, seed, cur.number);
    clock = 0; sub = 'intro'; subT = 1.6; hidden = new Set(); shownPage = -1;
    qEl.textContent = `第${cur.number}問：${cur.question.q}`;
    qEl.classList.add('big');
    pageEl.classList.add('hidden');
    renderChoices(false);
    renderScore();
  }

  function finishQuestion() {
    if (qs.delta.hero > 0 && mul !== 1) qs = { ...qs, delta: { ...qs.delta, hero: Math.round(qs.delta.hero * mul) } };
    const o = outcomeText(qs);
    lis.forEach((li, i) => li.classList.toggle('right', i === cur.question.answer));
    if (o) flash(o.text, 1.4);
    sub = 'reveal'; subT = 1.8;
  }

  function heroAnswer(i) {
    if (qs.excluded.includes(i) || hidden.has(i)) return;
    const before = qs;
    qs = answerQuestion(qs, cur.question, i, pages.length);
    if (qs === before) return;
    extraSfx(i === cur.question.answer ? 'correct' : 'wrong');
    if (qs.phase === 'done') { finishQuestion(); return; }
    flash('ブブー！ タバコヌスの番', 1.2);
    renderChoices(true);
    sub = 'ally'; subT = 0.8;
  }

  function allyAnswer() {
    let choice;
    if (!qs.secondChance) choice = ai.choiceIndex;
    else {
      choice = aiAnswerAfterWrong({
        seed, questionNumber: cur.number, strength: match.strength, question: cur.question,
        pagesRead: pagesReadAt(clock, pages.length), excluded: qs.excluded, totalPages: pages.length,
      });
    }
    qs = answerQuestion(qs, cur.question, choice, pages.length);
    extraSfx(choice === cur.question.answer ? 'correct' : 'wrong');
    renderChoices(true);
    if (qs.phase === 'done') { finishQuestion(); return; }
    flash('タバコヌスがまちがえた！ あなたの番', 1.4);
    sub = 'hero';
  }

  function updatePlay(d) {
    clock += d;
    if (sub === 'intro') {
      subT -= d;
      if (subT <= 0) {
        sub = 'reading';
        qEl.classList.remove('big');
        pageEl.classList.remove('hidden');
        clock = 0;
      }
      return;
    }
    if (sub === 'reading') {
      shownSec += d;
      reader = tickReader(reader, d, { speed });
      if (pressed.has('ArrowRight')) reader = nextPage(reader);
      if (pressed.has('ArrowLeft')) reader = prevPage(reader);
      if (pressed.has('KeyB') && opts.bookmark && !bookmarkUsed) {
        bookmarkUsed = true; reader = bookmarkJump(reader); flash('しおり！', 1);
      }
      renderPage();
      if (pressed.has('Space')) {
        qs = buzzIn(qs, 'hero', realPage());
        buzzSound(); sub = 'hero'; renderChoices(true);
        return;
      }
      if (aiBuzzReady({ buzzTime: aiBuzzAt }, { elapsed: clock, heroPage: reader.furthest })) {
        qs = buzzIn(qs, 'ally', ai.pagesRead);
        buzzSound(); flash('タバコヌスが押した！', 1); sub = 'ally'; subT = 0.8; renderChoices(true);
        return;
      }
      if (reader.finished) { qs = timeoutQuestion(qs); finishQuestion(); }
      return;
    }
    if (sub === 'hero') {
      for (let i = 0; i < 4; i++) if (pressed.has(`Digit${i + 1}`) || pressed.has(`Numpad${i + 1}`)) heroAnswer(i);
      if (sub === 'hero' && pressed.has('KeyE') && opts.eliminateOne && !elimUsed) {
        const w = [0, 1, 2, 3].filter((i) => i !== cur.question.answer && !qs.excluded.includes(i));
        if (w.length) { elimUsed = true; hidden.add(w[Math.floor(Math.random() * w.length)]); renderChoices(true); }
      }
      return;
    }
    if (sub === 'ally') {
      subT -= d;
      if (subT <= 0) allyAnswer();
      return;
    }
    if (sub === 'reveal') {
      subT -= d;
      if (subT <= 0) {
        match = applyQuestionResult(match, qs);
        renderScore();
        if (isFinished(match)) finish();
        else startQuestion();
      }
    }
  }

  function clearMenu() { if (menu) { menu.remove(); menu = null; } }
  function setPlayVisible(v) { for (const e of [qEl, pageEl, infoEl, scoreEl]) e.classList.toggle('hidden', !v); if (!v) choicesEl.classList.add('hidden'); }

  function showIntro() {
    clearMenu();
    phase = 'howto';
    setPlayVisible(false);
    const v = novelIntroView(carryLine);
    menu = createMenu(root, {
      title: v.title,
      lines: [...v.lines, ...v.rows.map(([k, d]) => `${k}：${d}`), v.win, { text: v.carry, cls: 'p4-item' }, v.note],
    }, () => {});
  }

  function showIntroOld() {
    clearMenu();
    phase = 'howto';
    setPlayVisible(false);
    menu = createMenu(root, {
      title: '小説一夜漬けチキンレース',
      lines: [
        '明日はテスト！ タバコヌスと小説をパラ読みして、問題に先に答えたほうが勝ち。',
        '流れ：問題が先に出る → → キー（クリック）でページをめくる（← で戻る） → 分かったら Space で早押し → 1〜4キーかクリックで答える。',
        '早く押すほど高得点。まちがえると減点で、相手の番になる。待ちすぎると先に答えられる＝チキンレース。',
        '勝ち方：小説2本・6問の合計点が多いほうの勝ち。操作：→ 早めくり ／ ← 戻る',
        { text: carryLine ? `持ち込み：${carryLine}` : '持ち込み：なし', cls: 'p4-item' },
        'Enter / Space で始める　Esc で館に戻る',
      ],
    }, () => {});
  }

  function startMatch() {
    clearMenu();
    seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    match = createNovelMatch({ seed, strength: 2 });
    bookmarkUsed = false; elimUsed = false; pendingSounds = [];
    phase = 'play'; paused = false;
    setPlayVisible(true);
    startQuestion();
  }

  function finish() {
    phase = 'result';
    setPlayVisible(false);
    const extra = [];
    if (carryLine) extra.push(carryLine);
    if (novelResult(match) === 'win') {
      const line = grantedLine(grantItem(ctx, GAME_ID), 'しおり');
      if (line) extra.push(line);
    }
    const v = novelResultView(match, extra);
    clearMenu();
    menu = createMenu(root, { title: v.title, lines: v.lines, choices: v.choices }, (id) => {
      if (id === 'again') startMatch();
      else leave();
    });
  }

  function leave() { toGallery(ctx, GAME_ID); }

  const scene = {
    name: 'novel',
    enter(a, b) {
      let params = a;
      if (a && (typeof a.goto === 'function' || typeof a.returnToGallery === 'function')) { ctx = a; params = b; }
      params = params || {};
      silliness = readNovelSilliness();
      const ci = carryInfo(ctx, GAME_ID, params.carry || params.carryResult);
      opts = novelItemOptions(ci.params);
      carryLine = ci.line;
      addStyle('novel-style', CSS);
      root = el('div'); root.id = 'novel-root';
      root.append(el('div', 'nv-shelf'), el('div', 'nv-lamp'), el('div', 'nv-desk'), el('div', 'nv-hero'), el('div', 'nv-tabako'));
      for (let i = 0; i < 3; i++) { const bb = el('div', 'nv-bubble'); bb.style.animationDelay = `${i}s`; root.appendChild(bb); }
      qEl = el('div', 'nv-q'); pageEl = el('div', 'nv-page'); infoEl = el('div', 'nv-info'); scoreEl = el('div', 'nv-score');
      choicesEl = el('ul', 'nv-choices hidden');
      lis = [0, 1, 2, 3].map((i) => {
        const li = el('li');
        li.addEventListener('click', () => { if (phase === 'play' && !paused && sub === 'hero') heroAnswer(i); });
        choicesEl.appendChild(li);
        return li;
      });
      pageEl.addEventListener('click', () => { if (phase === 'play' && !paused && sub === 'reading') pressed.add('ArrowRight'); });
      root.append(qEl, pageEl, infoEl, scoreEl, choicesEl);
      document.body.appendChild(root);
      window.addEventListener('keydown', onDown);
      guard = 0.4;
      showIntro();
    },
    update(dt) {
      if (!root) return;
      const d = Math.min(0.05, Number.isFinite(dt) && dt > 0 ? dt : 0);
      guard = Math.max(0, guard - d);
      ensureGameMusic('novel');
      if (phase === 'howto') {
        if (guard <= 0 && (pressed.has('Enter') || pressed.has('Space'))) startMatch();
        else if (pressed.has('Escape')) leave();
      } else if (phase === 'play') {
        if (paused) {
          for (const k of pressed) menu && menu.key(k);
          if (pressed.has('Escape')) { clearMenu(); paused = false; }
        } else if (pressed.has('Escape')) {
          paused = true;
          menu = createMenu(root, { title: 'ポーズ', choices: [{ id: 'resume', label: '続ける' }, { id: 'gallery', label: '館に戻る' }] }, (id) => {
            clearMenu(); paused = false;
            if (id === 'gallery') leave();
          });
        } else updatePlay(d);
      } else if (phase === 'result' && menu) {
        for (const k of pressed) menu.key(k);
      }
      pressed.clear();
      pendingSounds = pendingSounds.filter((s) => {
        s.at -= d;
        if (s.at <= 0) { extraSfx(s.name); return false; }
        return true;
      });
      if (msgEl) { msgT -= d; if (msgT <= 0) { msgEl.remove(); msgEl = null; } }
    },
    // 試し遊び用の状態（window.__smoke.state() が読む）
    smokeState() {
      return { phase, sub, t: clock, match: smokeSummary(match), opts: smokeSummary(opts) };
    },
    exit() {
      window.removeEventListener('keydown', onDown);
      stopGameMusic('novel');
      if (root) root.remove();
      root = null; menu = null; msgEl = null;
      pressed.clear();
    },
  };
  scene.start = scene.enter; scene.stop = scene.exit; scene.tick = scene.update; scene.dispose = scene.exit;
  return scene;
}

export default createNovelScene;
