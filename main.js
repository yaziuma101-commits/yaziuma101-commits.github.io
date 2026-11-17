// 絵と GIF を並べ、押したら大きく見せる（トップと「すべての絵」の両方で使う）
// 絵の一覧の1件は { t: 小さい画像, f: 大きい画像, d: "2026-05-02", w: 幅, h: 高さ }
(function () {
  const GIF_STEP = 24;
  const viewer = document.getElementById("viewer");
  const viewerImg = document.getElementById("viewer-img");
  const viewerCount = document.getElementById("viewer-count");
  let list = [];
  let index = 0;

  function jpDate(d) {
    if (!d) return "";
    const [y, m, day] = d.split("-").map(Number);
    return y + "年" + m + "月" + day + "日";
  }
  // 日付と時刻。時刻が分からないものは「時刻不明」
  function jpDateTime(item) {
    if (!item.d) return "";
    return jpDate(item.d) + "　" + (item.tm ? item.tm : "時刻不明");
  }

  // item は絵の1件か、GIF の画像の場所（文字列）
  function makeTile(item, group, i, alt) {
    const src = typeof item === "string" ? item : item.t;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tile";
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.loading = "lazy";
    img.decoding = "async";
    if (item.w && item.h) {
      img.width = item.w;
      img.height = item.h;
    }
    // 読み込み中は枠を点滅させ、届いたら止める
    const done = () => b.classList.add("loaded");
    img.addEventListener("load", done);
    img.addEventListener("error", done);
    b.appendChild(img);
    if (item.d) {
      const cap = document.createElement("span");
      cap.className = "tile-date";
      cap.textContent = jpDateTime(item);
      b.appendChild(cap);
    }
    b.addEventListener("click", () => open(group, i));
    return b;
  }

  function show() {
    const item = list[index];
    viewerImg.src = typeof item === "string" ? item : item.f;
    const where = (index + 1) + " / " + list.length;
    viewerCount.textContent = item.d ? jpDateTime(item) + "　" + where : where;
  }
  function open(group, i) {
    list = group;
    index = i;
    show();
    viewer.showModal();
  }
  function step(d) {
    index = (index + d + list.length) % list.length;
    show();
  }

  // トップ: 選んだ絵
  const drawingGrid = document.getElementById("drawing-grid");
  if (drawingGrid && window.PICKS) {
    window.PICKS.forEach((it, i) => drawingGrid.appendChild(makeTile(it, window.PICKS, i, "タクアンの絵 " + jpDate(it.d))));
  }

  // トップ: GIF（多いので少しずつ出す）
  const gifGrid = document.getElementById("gif-grid");
  const moreBtn = document.getElementById("gif-more");
  if (gifGrid && window.GIFS) {
    let shown = 0;
    const showMoreGifs = () => {
      const end = Math.min(shown + GIF_STEP, window.GIFS.length);
      for (; shown < end; shown++) gifGrid.appendChild(makeTile(window.GIFS[shown], window.GIFS, shown, "タクアンの GIF"));
      moreBtn.hidden = shown >= window.GIFS.length;
    };
    moreBtn.addEventListener("click", showMoreGifs);
    showMoreGifs();
  }

  // すべての絵: 月ごとに並べる（新しい月が上）
  const monthsBox = document.getElementById("months");
  if (monthsBox && window.ALL) {
    const byMonth = new Map();
    window.ALL.forEach((it) => {
      const key = it.d.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(it);
    });
    const keys = [...byMonth.keys()].sort().reverse();
    const nav = document.getElementById("month-nav");
    let currentYear = "";
    keys.forEach((key) => {
      const [y, m] = key.split("-");
      const items = byMonth.get(key);
      if (y !== currentYear) {
        currentYear = y;
        const yl = document.createElement("span");
        yl.className = "month-year";
        yl.textContent = y + "年";
        nav.appendChild(yl);
      }
      const a = document.createElement("a");
      a.href = "#m" + key;
      a.textContent = Number(m) + "月";
      nav.appendChild(a);

      const sec = document.createElement("section");
      sec.className = "month";
      sec.id = "m" + key;
      const h = document.createElement("h2");
      h.className = "month-title";
      h.innerHTML = y + "年" + Number(m) + "月 <small>" + items.length + "枚</small>";
      sec.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "date-grid";
      items.forEach((it, i) => grid.appendChild(makeTile(it, items, i, "タクアンの絵 " + jpDate(it.d))));
      sec.appendChild(grid);
      monthsBox.appendChild(sec);
    });
    const first = window.ALL.map((it) => it.d).sort()[0];
    document.getElementById("all-summary").textContent =
      "VRChat の中で描いた絵 " + window.ALL.length + " 枚を、描いた月ごとに並べています（" +
      jpDate(first) + "から）。日付と時刻は撮ったときのものです。押すと大きく見られます。";
  }

  // アクセスカウンター（トップだけ）。1回の訪問（タブを閉じるまで）につき1回だけ数える
  const counter = document.getElementById("counter");
  if (counter) {
    const DIGITS = 7;
    const draw = (str) => {
      counter.replaceChildren(...[...str].map((ch) => {
        const s = document.createElement("span");
        s.textContent = ch;
        return s;
      }));
    };
    // キリ番: 1000 ごと、または 3 桁以上のゾロ目（777、1111 など）
    const isKiriban = (n) => n > 0 && (n % 1000 === 0 || (n >= 100 && /^(\d)\1+$/.test(String(n))));
    let counted = false;
    try { counted = sessionStorage.getItem("takuan-counted") === "1"; } catch (e) { /* 使えなくても数える */ }
    fetch("/api/counter", { method: counted ? "GET" : "POST" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(({ count }) => {
        draw(String(count).padStart(DIGITS, "0"));
        counter.setAttribute("aria-label", count + " 人目");
        if (!counted) {
          try { sessionStorage.setItem("takuan-counted", "1"); } catch (e) { /* 何もしない */ }
          if (isKiriban(count)) {
            const k = document.getElementById("kiriban");
            k.textContent = "★ キリ番 " + count + " です！おめでとう！ ★";
            k.hidden = false;
            if (window.showKiriban) window.showKiriban(count); // お祝いの画面と証明書（top.js）
          }
        }
      })
      .catch(() => {
        counter.setAttribute("aria-label", "準備中");
        draw("-------");
      });
  }

  // 拡大表示の操作
  viewer.querySelector(".v-close").addEventListener("click", () => viewer.close());
  viewer.querySelector(".v-prev").addEventListener("click", () => step(-1));
  viewer.querySelector(".v-next").addEventListener("click", () => step(1));
  viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); });
  document.addEventListener("keydown", (e) => {
    if (!viewer.open) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
})();
