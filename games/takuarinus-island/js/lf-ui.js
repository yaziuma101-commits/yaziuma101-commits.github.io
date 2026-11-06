// レバガチャファイターヌスの HTML の重ね（体力ゲージ・タイマー・ラウンドのランプ・大きな文字・台詞）。
// 作るときには DOM に触らない（mount のときに要素を作る）。文字は 3D の中に描かない。

import { ensureGameMusic, stopGameMusic } from './audio.js';
import { createLfMusicDriver } from './lf-bgm.js';

function mk(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function createLfUi(env = {}) {
  const doc = env.doc || (typeof document !== 'undefined' ? document : null);
  // 試合が終わったら（勝ちランプが決着の数に届いたら）戦闘の曲 → 勝ち／負けの曲。0-0 に戻ると戦闘の曲
  const music = env.music !== undefined
    ? env.music
    : createLfMusicDriver({ ensure: ensureGameMusic, stop: stopGameMusic });
  let root = null;
  const E = {};
  let bannerT = 0;
  let sayT = 0;
  let noticeT = 0;
  const aura = { cur: 0, target: 0 };
  const hp = { p: 1, e: 1, pLag: 1, eLag: 1 };

  function side(cls) {
    const s = mk(doc, 'div', `lf-side ${cls}`);
    const name = mk(doc, 'div', 'lf-name');
    const bar = mk(doc, 'div', 'lf-bar');
    const lag = mk(doc, 'div', 'lf-lag');
    const fill = mk(doc, 'div', 'lf-fill');
    bar.append(lag, fill);
    const lampsEl = mk(doc, 'div', 'lf-lamps');
    const lamps = [mk(doc, 'span', 'lf-lamp'), mk(doc, 'span', 'lf-lamp')];
    lampsEl.append(...lamps);
    s.append(name, bar, lampsEl);
    return {
      s, name, fill, lag, lamps, lampsEl,
    };
  }

  function build() {
    if (root || !doc) return root;
    root = mk(doc, 'div');
    root.id = 'lf-root';
    const hud = mk(doc, 'div');
    hud.id = 'lf-hud';
    E.p = side('lf-p');
    E.e = side('lf-e');
    E.timer = mk(doc, 'div', '', '60');
    E.timer.id = 'lf-timer';
    hud.append(E.p.s, E.timer, E.e.s);
    E.banner = mk(doc, 'div');
    E.banner.id = 'lf-banner';
    E.bannerMain = mk(doc, 'div', 'lf-banner-main');
    E.bannerSub = mk(doc, 'div', 'lf-banner-sub');
    E.banner.append(E.bannerMain, E.bannerSub);
    E.say = mk(doc, 'div', 'hidden');
    E.say.id = 'lf-say';
    E.sayName = mk(doc, 'span', 'lf-say-name');
    E.sayText = mk(doc, 'span', 'lf-say-text');
    E.say.append(E.sayName, E.sayText);
    E.notice = mk(doc, 'div', 'hidden');
    E.notice.id = 'lf-notice';
    E.moves = mk(doc, 'div');
    E.moves.id = 'lf-moves';
    E.movesHead = mk(doc, 'div', 'lf-moves-head', '技の一覧');
    E.movesList = mk(doc, 'ul', 'lf-moves-list');
    E.movesNote = mk(doc, 'div', 'lf-moves-note', '※右向きのとき。左向きでは左右が逆');
    E.moves.append(E.movesHead, E.movesList, E.movesNote);
    E.aura = mk(doc, 'div');
    E.aura.id = 'lf-aura';
    E.aura.append(mk(doc, 'div', 'lf-aura-side lf-aura-l'), mk(doc, 'div', 'lf-aura-side lf-aura-r'));
    E.callouts = {};
    for (const who of ['p', 'e']) {
      const el = mk(doc, 'div', `lf-callout lf-callout-${who} hidden`);
      const name = mk(doc, 'div', 'lf-callout-name');
      const cmd = mk(doc, 'div', 'lf-callout-cmd');
      el.append(name, cmd);
      E.callouts[who] = {
        el, name, cmd, t: 0,
      };
    }
    root.append(E.aura, hud, E.banner, E.notice, E.say, E.moves, E.callouts.p.el, E.callouts.e.el);
    return root;
  }

  function hideBanner() {
    bannerT = 0;
    if (E.banner) E.banner.className = '';
  }
  function hideSay() {
    sayT = 0;
    if (E.say) E.say.classList.add('hidden');
  }
  function hideCallouts() {
    if (!E.callouts) return;
    for (const who of Object.keys(E.callouts)) {
      const c = E.callouts[who];
      c.t = 0;
      c.el.className = `lf-callout lf-callout-${who} hidden`;
    }
  }
  function hideNotice() {
    noticeT = 0;
    if (E.notice) E.notice.className = 'hidden';
  }
  function paintHp() {
    if (!E.p) return;
    E.p.fill.style.width = `${hp.p * 100}%`;
    E.e.fill.style.width = `${hp.e * 100}%`;
    E.p.lag.style.width = `${hp.pLag * 100}%`;
    E.e.lag.style.width = `${hp.eLag * 100}%`;
    E.p.fill.classList.toggle('lf-low', hp.p < 0.3);
    E.e.fill.classList.toggle('lf-low', hp.e < 0.3);
  }

  return {
    mount() {
      if (!build() || !doc.body) return;
      if (!root.parentNode) doc.body.append(root);
      doc.body.classList.add('lf-active');
    },
    unmount() {
      if (music && typeof music.reset === 'function') music.reset();
      hideCallouts();
      hideBanner();
      hideSay();
      hideNotice();
      aura.cur = 0;
      aura.target = 0;
      if (E.aura) E.aura.style.opacity = '0';
      if (root) root.classList.remove('lf-slow');
      if (root && root.parentNode) root.parentNode.removeChild(root);
      if (doc && doc.body) doc.body.classList.remove('lf-active');
    },
    setNames(p, e) {
      if (!E.p) return;
      E.p.name.textContent = String(p || '');
      E.e.name.textContent = String(e || '');
    },
    /** 体力の割合（0〜1） */
    setHp(p, e, { instant = false } = {}) {
      hp.p = clamp01(p);
      hp.e = clamp01(e);
      if (instant) {
        hp.pLag = hp.p;
        hp.eLag = hp.e;
      }
      paintHp();
    },
    setTimer(sec) {
      if (!E.timer) return;
      const n = Math.max(0, Math.ceil(Number(sec) || 0));
      E.timer.textContent = String(n).padStart(2, '0');
    },
    /** スローモーション中の暗い縁取り */
    setSlow(on) {
      if (root) root.classList.toggle('lf-slow', !!on);
    },
    /** 勝ったラウンドのランプ。target は必要な勝ち数（最終決戦で増える） */
    setWins(p, e, target = 2) {
      const n = Math.max(1, Math.min(5, Math.floor(Number(target) || 2)));
      if (music && typeof music.noteWins === 'function') {
        try {
          music.noteWins(p, e, n);
        } catch {
          // 曲が変わらなくても試合は続ける
        }
      }
      if (!E.p) return;
      for (const sd of [E.p, E.e]) {
        while (sd.lamps.length < n) {
          const l = mk(doc, 'span', 'lf-lamp');
          sd.lampsEl.append(l);
          sd.lamps.push(l);
        }
        while (sd.lamps.length > n) sd.lamps.pop().remove();
      }
      E.p.lamps.forEach((l, i) => l.classList.toggle('lf-on', i < p));
      E.e.lamps.forEach((l, i) => l.classList.toggle('lf-on', i < e));
    },
    /** 大きな文字（tone: '' | 'gold' | 'red'） */
    banner(text, sec = 1.2, tone = '', sub = '') {
      if (!E.banner) return;
      E.bannerMain.textContent = String(text || '');
      E.bannerSub.textContent = String(sub || '');
      E.banner.className = '';
      void E.banner.offsetWidth;
      E.banner.className = `lf-show${tone ? ` lf-${tone}` : ''}`;
      bannerT = Math.max(0.2, sec);
    },
    hideBanner,
    /** 台詞（名前と一言） */
    say(name, text, sec = 2.4) {
      if (!E.say) return;
      E.sayName.textContent = String(name || '');
      E.sayText.textContent = `「${String(text || '')}」`;
      E.say.classList.remove('hidden');
      sayT = Math.max(0.2, sec);
    },
    hideSay,
    /** 技の一覧。list は movesView の結果。fresh は今見つけた技（光らせる） */
    setMoves(list, fresh = null) {
      if (!build()) return;
      const items = (Array.isArray(list) ? list : []).map((m) => {
        const li = mk(doc, 'li', m.found ? 'lf-found' : (m.seen ? 'lf-seen' : ''));
        if (fresh && m.skill === fresh) li.classList.add('lf-new');
        const nameEl = mk(doc, 'span', 'lf-move-name', m.name || '');
        if (m.seen && !m.found) nameEl.append(mk(doc, 'span', 'lf-move-tag', '見た'));
        li.append(nameEl, mk(doc, 'span', 'lf-move-cmd', m.text || m.seenText || '？？？'));
        return li;
      });
      E.movesList.replaceChildren(...items);
    },
    setMovesVisible(on) {
      if (E.moves) E.moves.classList.toggle('hidden', !on);
    },
    /** 横長の帯の文字（必殺技の発見など） */
    notice(text, sec = 2.4) {
      if (!E.notice) return;
      E.notice.textContent = String(text || '');
      E.notice.className = '';
      void E.notice.offsetWidth;
      E.notice.className = 'lf-show';
      noticeT = Math.max(0.3, sec);
    },
    hideNotice,
    /** 必殺技の名前とコマンドを、出した人の頭上に出す（who: 'p' | 'e'） */
    callout(who, name, cmd, sec = 2, { first = false } = {}) {
      if (!E.callouts || !E.callouts[who]) return;
      const c = E.callouts[who];
      c.name.textContent = String(name || '');
      c.cmd.textContent = String(cmd || '');
      c.el.className = `lf-callout lf-callout-${who}${first ? ' lf-first' : ''}`;
      void c.el.offsetWidth;
      c.el.classList.add('lf-show');
      c.t = Math.max(0.3, Number(sec) || 2);
    },
    /** 表示の位置（画面の %）。表示中かどうかを返す */
    placeCallout(who, xPct, yPct) {
      if (!E.callouts || !E.callouts[who]) return false;
      const c = E.callouts[who];
      if (!(c.t > 0)) return false;
      c.el.style.left = `${Math.max(12, Math.min(88, xPct))}%`;
      c.el.style.top = `${Math.max(14, Math.min(82, yPct))}%`;
      return true;
    },
    calloutVisible(who) {
      return !!(E.callouts && E.callouts[who] && E.callouts[who].t > 0);
    },
    hideCallouts,
    /** 気合ゲージの不透明度（0〜1）。どの技かは示さない */
    setAura(op) {
      aura.target = clamp01(op);
    },
    tick(dt) {
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (bannerT > 0) {
        bannerT -= d;
        if (bannerT <= 0) hideBanner();
      }
      if (sayT > 0) {
        sayT -= d;
        if (sayT <= 0) hideSay();
      }
      if (noticeT > 0) {
        noticeT -= d;
        if (noticeT <= 0) hideNotice();
      }
      if (E.callouts) {
        for (const who of Object.keys(E.callouts)) {
          const c = E.callouts[who];
          if (c.t > 0) {
            c.t -= d;
            if (c.t <= 0) {
              c.t = 0;
              c.el.className = `lf-callout lf-callout-${who} hidden`;
            }
          }
        }
      }
      const up = aura.target > aura.cur;
      aura.cur += (aura.target - aura.cur) * Math.min(1, d * (up ? 18 : 5));
      if (E.aura) E.aura.style.opacity = aura.cur.toFixed(3);
      const k = Math.min(1, d * 2.5);
      hp.pLag = hp.pLag > hp.p ? hp.pLag + (hp.p - hp.pLag) * k : hp.p;
      hp.eLag = hp.eLag > hp.e ? hp.eLag + (hp.e - hp.eLag) * k : hp.e;
      paintHp();
    },
  };
}
