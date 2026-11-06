// 持ち込みアイテムを選ぶモーダルと、入場時の効果バナー（DOM の薄い利用者）。
// 作るときには DOM に触らない（最初に使うときに要素を作る）。

export function createItemUi(env = {}) {
  const doc = env.doc || (typeof document !== 'undefined' ? document : null);
  const win = env.win || (typeof window !== 'undefined' ? window : null);
  let root = null;
  let titleEl = null;
  let listEl = null;
  let bannerEl = null;
  let bannerTimer = null;
  let open = false;
  let sel = 0;
  let choices = [];
  let done = null;

  function ensure() {
    if (root || !doc || !doc.body) return;
    root = doc.createElement('div');
    root.id = 'item-modal';
    root.className = 'overlay hidden';
    const shade = doc.createElement('div');
    shade.className = 'item-shade';
    const panel = doc.createElement('div');
    panel.className = 'item-panel';
    titleEl = doc.createElement('h2');
    listEl = doc.createElement('ul');
    listEl.className = 'item-list';
    const note = doc.createElement('p');
    note.className = 'title-hint';
    note.textContent = '↑↓: 選ぶ　Enter: 決定　Esc: 持ち込まない';
    panel.append(titleEl, listEl, note);
    root.append(shade, panel);
    bannerEl = doc.createElement('div');
    bannerEl.id = 'item-banner';
    bannerEl.className = 'hidden';
    doc.body.append(root, bannerEl);
  }

  function render() {
    if (!listEl) return;
    listEl.textContent = '';
    choices.forEach((c, i) => {
      const li = doc.createElement('li');
      li.textContent = c.label;
      if (i === sel) li.classList.add('sel');
      li.addEventListener('mouseenter', () => {
        if (!open || sel === i) return;
        sel = i;
        render();
      });
      li.addEventListener('click', () => finish(i));
      listEl.append(li);
    });
  }

  function finish(i) {
    if (!open) return;
    open = false;
    if (root) root.classList.add('hidden');
    if (win) win.removeEventListener('keydown', onKey, true);
    const cb = done;
    done = null;
    const c = choices[i];
    if (typeof cb === 'function') cb(c ? c.id : null);
  }

  function onKey(e) {
    if (!open) return;
    e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (e.repeat) return;
    const n = choices.length;
    switch (e.code) {
      case 'ArrowUp': case 'KeyW':
        sel = (sel + n - 1) % n;
        render();
        break;
      case 'ArrowDown': case 'KeyS':
        sel = (sel + 1) % n;
        render();
        break;
      case 'Enter': case 'NumpadEnter': case 'Space': case 'KeyE':
        finish(sel);
        break;
      case 'Escape': {
        const none = choices.findIndex((c) => c.id === null);
        finish(none >= 0 ? none : n - 1);
        break;
      }
      default:
        break;
    }
  }

  function hideBanner() {
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = null;
    if (bannerEl) bannerEl.classList.add('hidden');
  }

  return {
    isOpen: () => open,
    /** 選択肢 [{id,label}] から1つ選ばせ、cb(id|null) を呼ぶ */
    choose({ title = '', choices: list = [], index = 0 } = {}, cb) {
      ensure();
      if (!root || !win || !list.length) {
        if (typeof cb === 'function') cb(null);
        return;
      }
      choices = list;
      sel = Math.max(0, Math.min(list.length - 1, index | 0));
      done = cb;
      titleEl.textContent = title;
      open = true;
      render();
      root.classList.remove('hidden');
      win.addEventListener('keydown', onKey, true);
    },
    /** 入場時の「アイテム効果：〜」や一言（sec 秒で消える） */
    banner(text, sec = 3) {
      ensure();
      if (!bannerEl || !text) return;
      bannerEl.textContent = String(text);
      bannerEl.classList.remove('hidden', 'pop');
      void bannerEl.offsetWidth;
      bannerEl.classList.add('pop');
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(hideBanner, Math.max(0.5, sec) * 1000);
    },
    hideBanner,
  };
}
