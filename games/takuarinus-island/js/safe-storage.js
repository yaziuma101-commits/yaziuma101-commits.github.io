// 保存先を安全にする（itch.io などの iframe の中では、localStorage を読むだけで例外になることがある）。
// 使えないときは、記憶の中だけの代わりを globalThis.localStorage に差し込む（各ゲームがそのまま読めるように）。
// 読み込み時には何もしない。main.js が最初に installSafeStorage() を呼ぶ。three.js・DOM に依存しない。

/** localStorage と同じ形の、記憶の中だけの保存先（ページを閉じると消える） */
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => { m.clear(); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

/** 使える localStorage があればそれを、無ければ代わりを差し込んで返す。{ok, storage} */
export function installSafeStorage(g = globalThis) {
  try {
    const s = g.localStorage;
    if (s && typeof s.getItem === 'function') {
      s.getItem('takuarinus-probe');
      return { ok: true, storage: s };
    }
  } catch {
    // 使えない（iframe でサイトのデータが止められているなど）
  }
  const mem = memoryStorage();
  try {
    Object.defineProperty(g, 'localStorage', { value: mem, configurable: true, writable: true });
  } catch {
    // 差し込めなくても、main.js の保存先は mem を使う
  }
  return { ok: false, storage: mem };
}
