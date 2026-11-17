// 足あと帳の画面。書きこみは /api/bbs（functions/api/bbs.js）。
// 書かれた文字はすべて textContent で入れる（HTML として解釈させない）。
// 管理: ページの URL の後ろに #kanri を付けて開くと、消す鍵の欄が出る（鍵は Cloudflare の BBS_ADMIN_KEY）。
(function () {
  const STAMP_NAME = { aoi: "よろしく", yaa: "やあ", kin: "すごい", niji: "にじ", nemui: "ねむい", oko: "おこ" };
  const form = document.getElementById("bbs-form");
  const say = document.getElementById("bbs-say");
  const list = document.getElementById("bbs-list");
  const kanri = document.getElementById("kanri");
  let adminKey = "";

  function msg(text, err) {
    say.textContent = text;
    say.classList.toggle("err", !!err);
  }
  function render(items) {
    list.replaceChildren();
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "small";
      li.textContent = "まだ足あとがありません。一番乗りをどうぞ！";
      list.appendChild(li);
      return;
    }
    items.forEach((e) => {
      const li = document.createElement("li");
      const img = document.createElement("img");
      img.className = "px";
      img.src = "images/retro/stamp-" + (STAMP_NAME[e.stamp] ? e.stamp : "aoi") + ".gif";
      img.alt = STAMP_NAME[e.stamp] || "";
      const body = document.createElement("div");
      const head = document.createElement("div");
      head.className = "bbs-head";
      const b = document.createElement("b");
      b.textContent = e.name;
      head.append(b, document.createTextNode(e.at));
      if (adminKey) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn bbs-del";
        del.textContent = "消す";
        del.addEventListener("click", () => remove(e.id));
        head.appendChild(del);
      }
      const p = document.createElement("p");
      p.className = "bbs-text";
      p.textContent = e.msg;
      body.append(head, p);
      li.append(img, body);
      list.appendChild(li);
    });
  }
  function load() {
    fetch("/api/bbs")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => render(d.list || []))
      .catch(() => {
        list.replaceChildren();
        const li = document.createElement("li");
        li.className = "small";
        li.textContent = "足あと帳はただいま準備中です。もう少しお待ちください。";
        list.appendChild(li);
      });
  }
  function remove(id) {
    if (!confirm("この足あとを消しますか？ 元に戻せません。")) return;
    fetch("/api/bbs?id=" + encodeURIComponent(id), { method: "DELETE", headers: { "x-admin-key": adminKey } })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) alert(d.error || "消せませんでした"); load(); })
      .catch(() => alert("消せませんでした"));
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const body = { name: f.get("name"), msg: f.get("msg"), stamp: f.get("stamp"), hp: f.get("hp") };
    if (!String(body.msg || "").trim()) { msg("ひとことを書いてください", true); return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    msg("書きこみ中……");
    fetch("/api/bbs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { msg(d.error || "書きこめませんでした", true); return; }
        msg("足あとを残しました。ありがとう！");
        form.msg.value = "";
        load();
      })
      .catch(() => msg("書きこめませんでした。足あと帳が準備中かもしれません", true))
      .finally(() => { btn.disabled = false; });
  });

  if (location.hash === "#kanri") {
    kanri.hidden = false;
    document.getElementById("kanri-on").addEventListener("click", () => {
      adminKey = document.getElementById("kanri-key").value;
      load();
    });
  }
  load();
})();
