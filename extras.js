// どのページにも付ける仕掛け: 時間で変わる空・記念日の飾り・ついてくるちびモヒ・放置すると居眠り
(function () {
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const q = new URLSearchParams(location.search);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 使えなくても動く */ } },
  };

  // 手元で確かめるときだけ ?date=2026-12-24&hour=2 で日時を変えられる
  function now() {
    const d = new Date();
    if (LOCAL && q.get("date")) {
      const [y, m, day] = q.get("date").split("-").map(Number);
      d.setFullYear(y, m - 1, day);
    }
    if (LOCAL && q.get("hour")) d.setHours(Number(q.get("hour")), 0, 0, 0);
    return d;
  }
  const t = now();
  const root = document.documentElement;
  const titleBox = document.querySelector(".title-box");
  const ticker = document.querySelector(".ticker span");

  // ---- 時間で変わる空 ----
  const h = t.getHours();
  const sky = h >= 1 && h < 5 ? "shinya" : h < 10 && h >= 5 ? "asa" : h < 17 && h >= 10 ? "hiru" : h < 19 && h >= 17 ? "yuu" : "yoru";
  root.classList.add("sky-" + sky);
  if (titleBox) {
    const label = { asa: "朝の島", hiru: "昼の島", yuu: "夕方の島", yoru: "夜の島", shinya: "真夜中の島" }[sky];
    const tag = document.createElement("p");
    tag.className = "sky-tag";
    tag.textContent = label;
    titleBox.prepend(tag);
    if (sky === "shinya") {
      const y = document.createElement("div");
      y.className = "yofukashi";
      y.innerHTML = '<img class="px" src="images/retro/yofukashi.gif" width="40" height="42" alt="夜ふかしヌス"><span>夜ふかしヌス「まだ起きてるの？　ぼくもだけど」</span>';
      titleBox.appendChild(y);
    }
  }

  // ---- 記念日の飾り ----
  const m = t.getMonth() + 1, d = t.getDate();
  let matsuri = null, say = "";
  if (m === 11 && d === 7) {
    const n = t.getFullYear() - 2026;
    matsuri = "kaisetsu";
    say = n > 0 ? `祝！ 本日はタクアンの島の開設 ${n} 周年です` : "祝！ 本日はタクアンの島の開設日です";
  } else if (m === 12 && d >= 20 && d <= 25) {
    matsuri = "xmas"; say = "メリークリスマス！ タクアリヌスもサンタ帽をかぶりました（モヒカンは突き抜けました）";
  } else if (m === 1 && d <= 3) {
    matsuri = "shogatsu"; say = "あけましておめでとうございます。今年もモヒカンをよろしくお願いします";
  }
  if (matsuri) {
    root.classList.add("matsuri-" + matsuri);
    if (ticker) ticker.textContent = "★ " + say + " " + ticker.textContent;
    if (titleBox) {
      const g = document.createElement("div");
      g.className = "garland";
      g.setAttribute("aria-hidden", "true");
      titleBox.prepend(g);
      const banner = document.createElement("p");
      banner.className = "matsuri-say";
      banner.textContent = say;
      titleBox.querySelector(".site-title")?.after(banner);
    }
    if (matsuri === "xmas") {
      document.querySelectorAll('.site-title img[src$="taku.gif"]').forEach((img) => { img.src = "images/retro/santa.gif"; });
      if (titleBox) {
        const snow = document.createElement("div");
        snow.className = "snow";
        snow.setAttribute("aria-hidden", "true");
        for (let i = 0; i < 24; i++) {
          const f = document.createElement("i");
          f.style.left = (i * 4.17 + (i % 3) * 1.3) + "%";
          f.style.animationDelay = (-(i * 0.73) % 6) + "s";
          f.style.animationDuration = (5 + (i % 4)) + "s";
          snow.appendChild(f);
        }
        titleBox.appendChild(snow);
      }
    }
  }

  // ---- ついてくるちびモヒ（スマホはタップした所へ歩く） ----
  const chibi = document.createElement("img");
  chibi.className = "chibi px";
  chibi.src = "images/retro/chibi-stand.gif";
  chibi.alt = "";
  chibi.width = 30; chibi.height = 36;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "chibi-toggle";
  document.body.append(chibi, toggle);

  let on = store.get("takuan-chibi") !== "off";
  let x = 40, y = window.innerHeight - 80, tx = x, ty = y, walking = false, raf = 0;
  function render() {
    chibi.hidden = !on;
    toggle.textContent = on ? "ちびモヒを消す" : "ちびモヒを出す";
    toggle.setAttribute("aria-pressed", String(on));
  }
  function step() {
    const dx = tx - x, dy = ty - y, dist = Math.hypot(dx, dy);
    if (dist < 2) {
      if (walking) { walking = false; chibi.src = "images/retro/chibi-stand.gif"; }
      raf = 0;
      return;
    }
    if (!walking) { walking = true; chibi.src = "images/retro/chibi.gif"; }
    const sp = Math.min(dist, Math.max(2, dist * 0.06));
    x += (dx / dist) * sp; y += (dy / dist) * sp;
    chibi.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)` + (dx < 0 ? " scaleX(-1)" : "");
    raf = requestAnimationFrame(step);
  }
  function goTo(px, py) {
    if (!on) return;
    tx = Math.max(0, Math.min(window.innerWidth - 34, px + 14));
    ty = Math.max(0, Math.min(window.innerHeight - 40, py + 10));
    if (!raf) raf = requestAnimationFrame(step);
  }
  document.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") goTo(e.clientX, e.clientY); }, { passive: true });
  document.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") goTo(e.clientX - 30, e.clientY - 46); }, { passive: true });
  toggle.addEventListener("click", () => {
    on = !on;
    store.set("takuan-chibi", on ? "on" : "off");
    render();
  });
  chibi.style.transform = `translate(${x}px, ${y}px)`;
  render();

  // ---- 放置すると居眠り ----
  const IDLE_MS = (LOCAL && Number(q.get("idle")) ? Number(q.get("idle")) : 45) * 1000;
  const nap = document.createElement("div");
  nap.className = "inemuri";
  nap.hidden = true;
  nap.setAttribute("role", "status");
  nap.innerHTML = '<img src="images/drawings/inemuri-kart.webp" alt="カートで居眠りするタクアリヌス（タクアン画）"><span class="zzz" aria-hidden="true">Z<i>z</i><b>z</b></span><span class="nap-say">すやすや……</span>';
  document.body.appendChild(nap);
  const napSay = nap.querySelector(".nap-say");
  let idleTimer = 0, sleeping = false, wakeTimer = 0;
  function sleep() {
    sleeping = true;
    nap.classList.remove("waking");
    napSay.textContent = "すやすや……";
    nap.hidden = false;
  }
  function poke() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(sleep, IDLE_MS);
    if (!sleeping) return;
    sleeping = false;
    nap.classList.add("waking");
    napSay.textContent = "はっ！ 寝てません";
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => { nap.hidden = true; }, 1600);
  }
  ["pointermove", "pointerdown", "keydown", "scroll", "wheel", "touchstart"].forEach((ev) => document.addEventListener(ev, poke, { passive: true }));
  poke();
})();
