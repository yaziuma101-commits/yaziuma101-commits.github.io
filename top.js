// トップだけの仕掛け: キリ番のお祝い画面と証明書・今日のタクアン占い
(function () {
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const q = new URLSearchParams(location.search);

  // ---- キリ番のお祝い（踏んだ人にだけ出る。main.js のカウンターから呼ぶ） ----
  const dlg = document.getElementById("kiri-dialog");
  const canvas = document.getElementById("kiri-canvas");
  const nameIn = document.getElementById("kiri-name");
  const save = document.getElementById("kiri-save");
  let kiriNo = 0;
  const sprite = new Image();
  sprite.src = "images/retro/taku.gif";

  function today() {
    const d = new Date();
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }
  async function drawCert() {
    try { await document.fonts.load('20px "DotGothic16"'); } catch (e) { /* 無くても描く */ }
    const c = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const F = (px) => px + 'px "DotGothic16", monospace';
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#fffef6"; c.fillRect(0, 0, W, H);
    // 二重の枠と四隅の飾り
    c.strokeStyle = "#13237a"; c.lineWidth = 6; c.strokeRect(14, 14, W - 28, H - 28);
    c.lineWidth = 2; c.strokeRect(26, 26, W - 52, H - 52);
    c.fillStyle = "#6fb6ff";
    [[30, 30], [W - 42, 30], [30, H - 42], [W - 42, H - 42]].forEach(([x, y]) => { c.fillRect(x + 4, y, 4, 12); c.fillRect(x, y + 4, 12, 4); });
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = "#13237a"; c.font = F(16); c.fillText("～ タクアンの島 ～", W / 2, 64);
    c.fillStyle = "#c8161d"; c.font = F(34); c.fillText("キリ番ゲット証明書", W / 2, 108);
    c.fillStyle = "#13237a"; c.font = F(60); c.fillText("第 " + kiriNo.toLocaleString("ja-JP") + " 番", W / 2, 186);
    c.font = F(17);
    const who = (nameIn.value.trim().slice(0, 16) || "名なしのモヒカン") + " 様";
    c.fillText(who, W / 2, 228);
    c.font = F(15);
    c.fillText("あなたはタクアンの島の " + kiriNo + " 人目のお客様として", W / 2, 264);
    c.fillText("見事キリ番を踏み抜いたことを、ここに証明します。", W / 2, 288);
    c.fillText("（この証明書に法的な効力は、まったくありません）", W / 2, 312);
    c.textAlign = "right"; c.font = F(14);
    c.fillText(today(), W - 120, 356);
    c.fillText("看板係（自称）タクアリヌス", W - 120, 380);
    // ヌスの印
    c.save(); c.translate(W - 80, 368); c.rotate(-0.14);
    c.strokeStyle = "#c8161d"; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 26, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "#c8161d"; c.textAlign = "center"; c.font = F(16); c.fillText("ヌス", 0, 6);
    c.restore();
    // タクアリヌス（ドット絵を4倍）
    if (sprite.complete && sprite.naturalWidth) c.drawImage(sprite, 52, H - 132, 64, 84);
    save.href = canvas.toDataURL("image/png");
    save.download = "kiriban-" + kiriNo + ".png";
  }
  window.showKiriban = function (n) {
    if (!dlg) return;
    kiriNo = n;
    document.getElementById("kiri-no").textContent = n;
    drawCert();
    dlg.showModal();
  };
  if (dlg) {
    nameIn.addEventListener("input", drawCert);
    sprite.addEventListener("load", () => { if (dlg.open) drawCert(); });
    dlg.querySelector(".kiri-close").addEventListener("click", () => dlg.close());
    // 手元で見た目を確かめるときだけ ?kiriban=7777
    if (LOCAL && q.get("kiriban")) window.showKiriban(Number(q.get("kiriban")));
  }

  // ---- 今日のタクアン占い（1日1回） ----
  const KUJI = [
    { k: "大吉", w: 8, msg: "モヒカンがいつもより 3 ミリ高く立つ日。何をやってもだいたいうまくいきます。", item: "しましまの靴下", color: "青と水色" },
    { k: "中吉", w: 14, msg: "いいことがふたつ、ちょっと困ることがひとつ。差し引きでいい日です。", item: "たくあん二切れ", color: "水色" },
    { k: "小吉", w: 18, msg: "小さな幸せが、気づかないくらいの大きさで落ちています。足元を見て歩きましょう。", item: "消しゴムのかす", color: "うすい青" },
    { k: "吉", w: 18, msg: "ふつうにいい日。ふつうが一番、とタクアリヌスは言っています（たぶん）。", item: "まるいもの", color: "白" },
    { k: "末吉", w: 14, msg: "今はまだ芽が出ていません。夕方ごろ、なにかがちょっと伸びます。", item: "植木ばち", color: "緑" },
    { k: "モヒ吉", w: 10, msg: "占いの本にのっていない運勢です。モヒカンにまつわる何かが起きます。起きなかったらすみません。", item: "くし", color: "モヒカン色" },
    { k: "寝吉", w: 8, msg: "今日は寝るのが一番の開運です。この占いを見たら、もう寝てください。", item: "まくら", color: "夜の紺" },
    { k: "凶", w: 6, msg: "大丈夫、凶のあとは上がるだけです。タクアリヌスが横で応援しています（声は小さいです）。", item: "ばんそうこう", color: "濃い青" },
    { k: "大吉の吉", w: 4, msg: "大吉よりさらに吉、という意味です。今つくりました。いいことしか起きません。", item: "このページ", color: "金色" },
  ];
  const omi = document.getElementById("omikuji");
  if (omi) {
    const btn = omi.querySelector("button");
    const out = omi.querySelector(".omikuji-result");
    const again = omi.querySelector(".omikuji-again");
    const dayKey = (() => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); })();
    const read = () => { try { return JSON.parse(localStorage.getItem("takuan-omikuji") || "null"); } catch (e) { return null; } };
    function show(i) {
      const r = KUJI[i];
      out.replaceChildren();
      const big = document.createElement("span"); big.className = "kuji"; big.textContent = r.k;
      const p = document.createElement("p"); p.style.margin = "4px 0 0"; p.textContent = r.msg;
      const dl = document.createElement("dl");
      [["ラッキーアイテム", r.item], ["ラッキーモヒカン色", r.color]].forEach(([a, b]) => {
        const dt = document.createElement("dt"); dt.textContent = a;
        const dd = document.createElement("dd"); dd.textContent = b;
        dl.append(dt, dd);
      });
      out.append(big, p, dl);
      out.hidden = false;
      btn.hidden = true;
      again.hidden = false;
    }
    const saved = read();
    if (saved && saved.day === dayKey && KUJI[saved.i]) show(saved.i);
    btn.addEventListener("click", () => {
      const total = KUJI.reduce((s, r) => s + r.w, 0);
      let n = crypto.getRandomValues(new Uint32Array(1))[0] % total, i = 0;
      while (n >= KUJI[i].w) { n -= KUJI[i].w; i++; }
      try { localStorage.setItem("takuan-omikuji", JSON.stringify({ day: dayKey, i })); } catch (e) { /* 保存できなくても見せる */ }
      btn.disabled = true;
      btn.textContent = "がらがら……";
      setTimeout(() => show(i), 700);
    });
  }
})();
