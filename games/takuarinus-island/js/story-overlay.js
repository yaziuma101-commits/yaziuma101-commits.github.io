// 物語の演出の重ね表示（DOM の薄い層）: 映画の黒帯・大きな見出し・話し手つきの字幕・紙吹雪。
// 読み込み時には DOM に触らない（node --test から import されるため）。

export function createStoryOverlay(doc = typeof document !== 'undefined' ? document : null) {
  let root = null;
  let top = null;
  let bottom = null;
  let cap = null;
  let sub = null;
  let who = null;
  let text = null;
  let confetti = null;

  function ensure() {
    if (root || !doc) return !!root;
    root = doc.createElement('div');
    root.id = 'story-overlay';
    top = doc.createElement('div');
    top.className = 'story-bar story-bar-top';
    bottom = doc.createElement('div');
    bottom.className = 'story-bar story-bar-bottom';
    cap = doc.createElement('div');
    cap.className = 'story-caption';
    sub = doc.createElement('div');
    sub.className = 'story-sub hidden';
    who = doc.createElement('span');
    who.className = 'story-sub-who';
    text = doc.createElement('span');
    text.className = 'story-sub-text';
    sub.append(who, text);
    confetti = doc.createElement('div');
    confetti.className = 'story-confetti hidden';
    for (let i = 0; i < 28; i++) {
      const c = doc.createElement('i');
      c.style.left = `${(i * 37) % 100}%`;
      c.style.animationDelay = `${((i * 53) % 30) / 10}s`;
      c.className = `story-confetti-${i % 4}`;
      confetti.append(c);
    }
    root.append(confetti, top, bottom, cap, sub);
    doc.body.append(root);
    return true;
  }

  return {
    /** 黒帯（シネマスコープ）を出す・しまう */
    letterbox(on) {
      if (!ensure()) return;
      root.classList.toggle('on', !!on);
    },
    /** 大きな見出し。kind: 'end'（エンディング風）・'shock'（揺れる）・'title'（章の名前） */
    caption(s, kind = '') {
      if (!ensure()) return;
      cap.textContent = s || '';
      cap.className = `story-caption${s ? ' show' : ''}${kind ? ` story-caption-${kind}` : ''}`;
    },
    /** 話し手つきの字幕。s が空なら消す */
    subtitle(name, s) {
      if (!ensure()) return;
      sub.classList.toggle('hidden', !s);
      who.textContent = name || '';
      text.textContent = s || '';
    },
    /** 画面の色合い: 'flashback'（回想は暗く・まわりを落とす）か ''（ふだん） */
    mood(name) {
      if (!ensure()) return;
      root.classList.toggle('story-mood-flashback', name === 'flashback');
    },
    /** 右下の操作の案内（空なら消す） */
    skipHint(s) {
      if (!ensure()) return;
      let el = root.querySelector('.story-skip');
      if (!el) {
        el = doc.createElement('div');
        el.className = 'story-skip';
        root.append(el);
      }
      el.textContent = s || '';
    },
    confetti(on) {
      if (!ensure()) return;
      confetti.classList.toggle('hidden', !on);
    },
    hideAll() {
      if (!root) return;
      root.classList.remove('on', 'story-mood-flashback');
      const sk = root.querySelector('.story-skip');
      if (sk) sk.textContent = '';
      cap.textContent = '';
      cap.className = 'story-caption';
      sub.classList.add('hidden');
      confetti.classList.add('hidden');
    },
  };
}
