# タクアンの島

タクアンの絵・GIF・ゲーム・実況動画・グッズをまとめたサイト。GitHub Pages で公開する。

## 中身

| 場所 | 中身 |
|---|---|
| `index.html` / `style.css` / `main.js` | サイト本体 |
| `drawings.html` | すべての絵（月ごと・日付つき） |
| `data.js` | トップに載せる選んだ絵（`PICKS`）と GIF の一覧 |
| `all.js` | すべての絵の一覧（自動で作る） |
| `images/all/` | VRChat の絵。`full/`＝大きい画像、`thumb/`＝一覧用。月ごとのフォルダ、名前は撮った日時 |
| `images/drawings/` | 最初の画面とグッズの欄に飾る絵 |
| `images/gif/` | GIF |
| `images/game/` | ゲームの画面写真 |
| `games/takuarinus-island/` | 「タクアリヌスとモヒカンの島」の公開版（AI_Soft の `projects/0038-…/dist/site` の写し） |

## 絵の選び方（2026-11-06）

VRChat の写真 3,540 枚（`Pictures/VRChat` の月フォルダと zip 4つ）から、次のものを外して 2,427 枚を載せた。

- 他の人（アバター・名札）が写っているもの 845 枚。**自分のアバターだけが写っているものも、見分けがつかないので外した**
- 絵が写っていないもの（景色・食べ物・QR など）126 枚
- 同じ絵をほぼ同じ向きで撮ったもの 95 枚

結果は `C:/work/takuan-work/class/result.json`（写真の番号と外した理由）。

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
