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

  // ---- 今日のタクアン占い（1日1回）。運勢を引いて、その運勢の絵から1枚出す ----
  // 絵はタクアンの絵（サイトに載っているもの）。コメントは絵を見てから AI が書いた
  const A = (s) => ({ t: "images/all/thumb/" + s + ".webp", f: "images/all/full/" + s + ".webp" });
  const D = (n) => ({ t: "images/drawings/" + n + ".webp", f: "images/drawings/" + n + ".webp" });
  const KUJI = [
    { k: "大吉", w: 8, color: "青と水色", pics: [
      { ...A("2026-11/2026-11-07_23-11-31-081"), alt: "らんらんと歌いながら踊るタクアリヌス", msg: "らんらん らんらん、と歌いながら一日が終わる日。音程はずれていても大丈夫、今日はそれが正解です。", item: "音符" },
      { ...A("2025-10/2025-10-04_01-42-55-300"), alt: "富士山の前でポーズを決めるタクアリヌス二人", msg: "富士山の前で、二人そろって決めポーズ。今日のあなたは、日本一高いところまで調子に乗れます。", item: "おそろいのポーズ" },
      { ...A("2025-08/2025-08-31_22-37-09-731"), alt: "祝1周年と書かれたタクアリヌスの肖像画", msg: "祝・なにかの1周年。何の記念日かは分からなくても、とりあえず祝っておくと運が開けます。", item: "額縁" },
      { ...A("2026-02/2026-02-25_23-29-32-308"), alt: "BIG LOVE と書かれた、猫とタクアリヌスが抱き合う絵", msg: "BIG LOVE の日。猫にも人にもモヒカンにも、大きめの愛を配って歩きましょう。", item: "ハート二つ" },
      { ...A("2026-03/2026-03-31_00-28-44-885"), alt: "同士よっ！と叫んで抱き合う二人", msg: "「同士よっ！」と抱き合える相手に出会える日。ガバッといってよし。ただし相手の都合は聞くこと。", item: "ガバッ" },
    ] },
    { k: "中吉", w: 14, color: "水色", pics: [
      { ...A("2026-01/2026-01-22_01-16-27-612"), alt: "みたらし団子を前にするタクアリヌス", msg: "みたらしの甘いひととき。おやつの時間をちゃんと取ると、午後の運勢が一段上がります。", item: "みたらし団子" },
      { ...A("2025-11/2025-11-14_00-15-18-350"), alt: "たき火のそばで武器を構えるタクアリヌス", msg: "たき火のそばで、何かと戦う準備は万端。敵はたぶん出てきません。焼きマシュマロが吉。", item: "たき火" },
      { ...A("2026-07/2026-07-25_00-09-46-348"), alt: "こっちのが涼しいと言ってうちわを持つタクアリヌス", msg: "「こっちのが涼しい」と言える場所を見つけた人の勝ち。今日は日陰と風通しに運があります。", item: "うちわ" },
      { ...D("nakayoshi"), alt: "大きなたくあんと仲よしのタクアリヌス", msg: "大きなたくあんと仲よし。好きなものをぎゅっと抱きしめると、いいことが寄ってきます。", item: "たくあん一本" },
      { ...D("mohifry"), alt: "モヒフライと書かれた、エビフライ風のモヒカンたち", msg: "モヒカンがエビフライになる日。何を言っているか分からなくても、揚げたては正義です。", item: "モヒフライ" },
    ] },
    { k: "小吉", w: 18, color: "うすい青", pics: [
      { ...A("2026-11/2026-11-07_23-02-43-580"), alt: "実は貫通してるんでございますと説明するタクアリヌス", msg: "実はモヒカン、貫通してるんでございます。今日は小さな秘密をひとつ打ち明けると、気が楽になります。", item: "ひみつ" },
      { ...A("2025-05/2025-05-12_23-24-32-899"), alt: "コーヒーはブラックに限りやすねと言うタクアリヌス", msg: "コーヒーはブラックに限りやすね。ちょっと大人ぶると、ちょっといいことがあります。苦かったら牛乳を足してよし。", item: "ブラックコーヒー" },
      { ...D("toufu"), alt: "とうふ大好きと書かれた、とうふのタクアリヌス", msg: "とうふ大好き。今日はやわらかく生きると吉。角に頭をぶつけないよう気をつけて。", item: "とうふ" },
      { ...D("onasu"), alt: "おなすだぁ〜いすき、と書かれたなすのタクアリヌス", msg: "おなす、だぁ〜いすき。好きなものを好きと言える日は、それだけで小吉です。", item: "なす" },
    ] },
    { k: "吉", w: 18, color: "白", pics: [
      { ...A("2026-02/2026-02-16_22-02-26-830"), alt: "どうぞと言って何かを差し出すタクアリヌス", msg: "「どうぞ」と差し出されたら、遠慮せず受け取る日。何をもらったかは、あとで考えましょう。", item: "差し出されたもの" },
      { ...A("2026-10/2026-10-01_23-00-15-623"), alt: "おともだちぼしゅう！！と書かれた貼り紙", msg: "おともだち、ぼしゅう中。今日は誰かに「やあ」と言ってみると、ふつうにいい日になります。", item: "貼り紙" },
      { ...A("2026-03/2026-03-31_23-18-38-311"), alt: "あっしのことですかい？と聞くタクアリヌスたち", msg: "「あっしのことですかい？」……いいえ、あなたのことです。今日はふつうに吉です。", item: "あっし" },
      { ...D("mohikan-motte"), alt: "モヒカンを手に持って歩くタクアリヌス", msg: "モヒカンを手に持って出かける日。外せるものは外して、身軽にいきましょう。", item: "取り外せるモヒカン" },
    ] },
    { k: "末吉", w: 14, color: "緑", pics: [
      { ...A("2026-05/2026-05-12_23-04-27-527"), alt: "モヒカンが飛んでいってもセーフと言うタクアリヌス", msg: "モヒカンが飛んでいっても、セーフ。今日は何かが外れても、だいたいセーフです。", item: "予備のモヒカン" },
      { ...A("2025-09/2025-09-10_00-08-47-666"), alt: "モヒカンになるスイッチの前のタクアリヌス", msg: "モヒカンになるスイッチを見つけても、押すのは明日にしましょう。今日はまだ芽が出る前です。", item: "押さないスイッチ" },
      { ...A("2026-09/2026-09-26_00-16-17-702"), alt: "星空で遊びでやってんだよと言うタクアリヌス", msg: "「遊びでやってんだよ」と言える余裕が、夕方ごろ運を連れてきます。本気は明日でいい。", item: "星空" },
    ] },
    { k: "モヒ吉", w: 10, color: "モヒカン色", pics: [
      { ...D("atama-poripori"), alt: "モヒカンの根元をぽりぽりかくタクアリヌス", msg: "モヒカンの根元がかゆくなる日。かいていると、ふといいことを思いつきます。", item: "くし" },
      { ...A("2025-12/2025-12-25_00-27-46-029"), alt: "皿はもってきたか？と聞くタクアリヌス", msg: "「皿はもってきたか？」と聞かれる日。持っていくと、何かを盛ってもらえます。", item: "皿" },
    ] },
    { k: "寝吉", w: 8, color: "夜の紺", pics: [
      { ...D("inemuri-kart"), alt: "カートに乗ったまま居眠りするタクアリヌス", msg: "今日は昼寝が吉。モヒカンも寝かせておくこと。乗りものの上では寝ないこと。", item: "まくら" },
      { ...A("2026-08/2026-08-22_02-00-54-851"), alt: "おなかゴロゴロすると書かれた、寝転ぶタクアリヌス", msg: "おなかをゴロゴロさせながら寝転ぶのが、今日いちばんの開運法です。", item: "毛布" },
      { ...A("2025-03/2025-03-15_00-20-56-325"), alt: "寝転んですしが降ってこねえかなと言うタクアリヌス", msg: "寝転んで「すしが降ってこねえかな」と待つ日。降ってきませんが、待っている時間が幸せです。", item: "空からのすし（予定）" },
    ] },
    { k: "凶", w: 6, color: "濃い青", pics: [
      { ...A("2026-06/2026-06-06_02-53-33-932"), alt: "このままでは危ないと書かれたタクアリヌス", msg: "このままでは危ない。……でも、気づいた時点でもう半分大丈夫です。お茶でも飲みましょう。", item: "お茶" },
      { ...A("2025-02/2025-02-11_23-45-17-913"), alt: "今日は何もなかった…と書かれた、ぼんやりしたタクアリヌス", msg: "今日は何もなかった……という日も、何も悪いことがなかった日です。凶のわりに平和です。", item: "ぼんやり" },
      { ...A("2026-11/2026-11-05_23-22-44-751"), alt: "がおー！！と叫ぶタクアリヌスと、うーと唸る相手", msg: "がおー！！と言われても、うー、と言い返せば引き分け。今日は引き分けで上出来です。", item: "うー" },
    ] },
    { k: "大吉の吉", w: 4, color: "金色", pics: [
      { ...A("2025-02/2025-02-05_01-21-07-597"), alt: "えをかいたのはタクアリヌス!!と胸を張るタクアリヌス", msg: "えへん。この絵をかいたのはタクアリヌス（ということになっています）。今日は胸を張るだけで、いいことしか起きません。", item: "このページ" },
    ] },
  ];
  const omi = document.getElementById("omikuji");
  const kdlg = document.getElementById("kuji-dialog");
  if (omi && kdlg) {
    const btn = omi.querySelector("button.omikuji-draw");
    const mini = omi.querySelector(".omikuji-result");
    const again = omi.querySelector(".omikuji-again");
    const dayKey = (() => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); })();
    const read = () => { try { return JSON.parse(localStorage.getItem("takuan-omikuji") || "null"); } catch (e) { return null; } };
    const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
    function fill(r, p) {
      const img = kdlg.querySelector(".kuji-pic img");
      img.src = p.f; img.alt = p.alt + "（タクアン画）";
      kdlg.querySelector(".kuji-k").textContent = r.k;
      kdlg.querySelector(".kuji-msg").textContent = p.msg;
      kdlg.querySelector(".kuji-item").textContent = p.item;
      kdlg.querySelector(".kuji-color").textContent = r.color;
    }
    function show(i, j, open) {
      const r = KUJI[i], p = r.pics[j] || r.pics[0];
      fill(r, p);
      mini.replaceChildren();
      const im = document.createElement("img"); im.src = p.t; im.alt = p.alt + "（タクアン画）";
      const big = document.createElement("span"); big.className = "kuji"; big.textContent = r.k;
      const look = document.createElement("button"); look.type = "button"; look.className = "btn"; look.textContent = "もう一度見る";
      look.addEventListener("click", () => kdlg.showModal());
      mini.append(im, big, look);
      mini.hidden = false;
      btn.hidden = true;
      again.hidden = false;
      if (open) kdlg.showModal();
    }
    kdlg.querySelector(".kuji-close").addEventListener("click", () => kdlg.close());
    kdlg.addEventListener("click", (e) => { if (e.target === kdlg) kdlg.close(); });
    const saved = read();
    // 手元で見た目を確かめるときだけ ?kuji=運勢の番号-絵の番号（例 5-0）
    const force = LOCAL && /^\d+-\d+$/.test(q.get("kuji") || "") ? q.get("kuji").split("-").map(Number) : null;
    if (force && KUJI[force[0]]) show(force[0], force[1], true);
    else if (saved && saved.day === dayKey && KUJI[saved.i]) show(saved.i, saved.j || 0, false);
    btn.addEventListener("click", () => {
      const total = KUJI.reduce((s, r) => s + r.w, 0);
      let n = rand(total), i = 0;
      while (n >= KUJI[i].w) { n -= KUJI[i].w; i++; }
      const j = rand(KUJI[i].pics.length);
      try { localStorage.setItem("takuan-omikuji", JSON.stringify({ day: dayKey, i, j })); } catch (e) { /* 保存できなくても見せる */ }
      btn.disabled = true;
      btn.textContent = "がらがら……";
      setTimeout(() => show(i, j, true), 700);
    });
  }

  // 絵を並べたあとでページが伸びるので、#game-jukusei などで来たときは並べ終わってから飛び直す
  // （ゲームの「おわる」ボタンからここへ戻ってくる）
  if (/^#[\w-]+$/.test(location.hash)) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) {
      // 少しのあいだ何度か合わせ直す（あとから伸びる分に追いつくため）。自分でスクロールしたらやめる
      const timers = [0, 150, 500, 1200, 2500, 4000].map((ms) => setTimeout(() => target.scrollIntoView(), ms));
      const stop = () => { timers.forEach(clearTimeout); ["wheel", "touchstart", "keydown", "mousedown"].forEach((t) => removeEventListener(t, stop)); };
      ["wheel", "touchstart", "keydown", "mousedown"].forEach((t) => addEventListener(t, stop, { passive: true }));
    }
  }
})();
