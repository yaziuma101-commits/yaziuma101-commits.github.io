# タクアンの島

タクアンの絵・GIF・ゲーム・実況動画・グッズをまとめたサイト。GitHub Pages で公開する。

## 中身

| 場所 | 中身 |
|---|---|
| `index.html` / `style.css` / `main.js` | サイト本体（2000年ごろの個人ホームページ風） |
| `aisatsu.html` | タクアリヌスのご挨拶 |
| `functions/api/counter.js` | アクセスカウンター（Cloudflare Pages Functions と KV） |
| `images/retro/` | ドット絵の飾り（GIF）。`node tools/retro-art.mjs` で作り直せる |
| `drawings.html` | すべての絵（月ごと・日付つき） |
| `data.js` | トップに載せる選んだ絵（`PICKS`）と GIF の一覧 |
| `all.js` | すべての絵の一覧（自動で作る） |
| `images/all/` | VRChat の絵。`full/`＝大きい画像、`thumb/`＝一覧用。月ごとのフォルダ、名前は撮った日時 |
| `images/drawings/` | 最初の画面とグッズの欄に飾る絵 |
| `images/gif/` | GIF |
| `images/game/` | ゲームの画面写真 |
| `games/takuarinus-island/` | 「タクアリヌスとモヒカンの島」の公開版（AI_Soft の `projects/0038-…/dist/site` の写し） |

## 絵の選び方（2026-11-06）

VRChat の写真 3,540 枚（`Pictures/VRChat` の月フォルダと zip 4つ）から、次のものを外して 2,427 枚を載せた（2026-11-17 に依頼者の頼みで 63 枚を下げ、いまは 2,364 枚。トップは 193 枚）。

- 他の人（アバター・名札）が写っているもの 845 枚。**自分のアバターだけが写っているものも、見分けがつかないので外した**
- 絵が写っていないもの（景色・食べ物・QR など）126 枚
- 同じ絵をほぼ同じ向きで撮ったもの 95 枚

結果は `C:/work/takuan-work/class/result.json`（写真の番号と外した理由）。

**依頼者が下げてほしいと言った絵**は `class/manual.json` の `drop` に入れてある（2026-11-17 に63枚）。`build.py` を走らせても戻らない。

## 新しい VRChat の絵を足すとき

道具は `C:/work/takuan-work/tools/`。

1. `prep.py` をコンテナで走らせる（写真を軽くして、見比べ用の一覧画像と目録を作る）。
2. `class/part-*.json` に、外す写真の番号を書く。戻したい写真は `class/manual.json` の `keep`、トップに足したい写真は `best` に書く。
3. `build.py` を走らせると、`images/all/`・`all.js`・`data.js` の `PICKS` が作り直される。

## GIF を足すとき

`images/gif/` に置いて、`data.js` の `GIFS` に `"images/gif/新しい名前.gif",` を1行足す。

## ゲームを新しい版にするとき

`games/takuarinus-island/` の中身を、新しい `dist/site/` の中身で丸ごと置き換える。

## 手元で見るとき

ゲームはファイルを直接開くと動かない（ブラウザの決まり）。サーバーを立てて見る。

```
python -m http.server 8765 --directory C:/work/takuan-site
```

http://localhost:8765 を開く。

## アクセスカウンター

トップの「あなたは ○ 人目」は `functions/api/counter.js` が数える。数は Cloudflare の KV に入れる。
1回の訪問（タブを閉じるまで）につき1回だけ数える。キリ番（1000 ごと・777 のようなゾロ目）を踏むと、その人にだけ「キリ番です！」と出る。

Cloudflare 側の準備（ダッシュボードで1回だけ）:

1. 「ストレージとデータベース」→「Workers KV」で名前空間を作る（名前の例: `takuan-counter`）。
2. 「Workers & Pages」→ `takuan-site` →「設定」→「バインディング」で「KV 名前空間」を足す。変数名は **`COUNTER`**、名前空間は 1 で作ったもの。
3. もう一度デプロイする（次の push か、「デプロイ」の画面で最新のものを再試行）。

KV が結びついていないあいだは、カウンターに「-------」と出るだけで、ほかは普通に動く。
KV の無料枠は書き込みが1日1,000回まで（1日1,000人を超えると、その日の超えた分は数えられない）。
手元の `python -m http.server` では Functions が動かないので、カウンターは「-------」になる。
