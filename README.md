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

VRChat の写真 3,540 枚（`Pictures/VRChat` の月フォルダと zip 4つ）から、次のものを外して 2,427 枚を載せた（2026-11-17 に依頼者の頼みで 91 枚を下げ、同じ日に 11-07〜16 の新しい写真 77 枚から 62 枚を足して、いまは 2,398 枚。トップは 199 枚）。

- 他の人（アバター・名札）が写っているもの 858 枚。**自分のアバターだけが写っているものも、見分けがつかないので外した**
- 絵が写っていないもの（景色・食べ物・QR など）127 枚
- 同じ絵をほぼ同じ向きで撮ったもの 96 枚

結果は `C:/work/takuan-work/class/result.json`（写真の番号と外した理由）。

**依頼者が下げてほしいと言った絵**は `class/manual.json` の `drop` に入れてある（2026-11-17 に91枚）。`build.py` を走らせても戻らない。

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

## 仕掛け（2026-11-17）

| 仕掛け | 場所 |
|---|---|
| キリ番のお祝い画面と証明書（画像で保存） | `top.js`（カウンターの結果から呼ぶ） |
| 足あと帳（掲示板・モヒカンのスタンプ） | `bbs.html`・`bbs.js`・`functions/api/bbs.js` |
| 今日のタクアン占い（1日1回。運勢を引くと、その運勢に割り当てたタクアンの絵30枚から1枚と、絵にちなんだコメントが出る。手元だけ `?kuji=運勢-絵` で確認できる） | `top.js` |
| 隠しモヒカン → ひみつの部屋（見つけた人数） | トップの下の波の上・`himitsu.html`・`functions/api/secret.js` |
| ついてくるちびモヒ（スマホはタップした所へ。右下で消せる） | `extras.js` |
| 肖像に話しかける | `aisatsu.html` の中 |
| 放置すると居眠り（45秒） | `extras.js` |
| 熟成デッキ | `games/jukusei-deck/`（AI_Soft の origin/main の `projects/jukusei-deck/game` を写した。テストと道具は除いた） |
| 時間で変わる空・深夜の夜ふかしヌス | `extras.js`・`style.css` |
| 記念日の飾り（11/7 開設日・12/20〜25 クリスマス・1/1〜3 正月） | `extras.js` |

足あと帳と隠しページの人数は、カウンターと同じ KV（`COUNTER`）を使う（キーは `bbs:list`・`bbs:wait:…`・`secret:total`）。
足あと帳の荒らしよけ: お名前16文字・ひとこと140文字まで、URL は書けない、同じ人は1分あける、人に見えない欄に何か入っていたら機械とみなす、表示は textContent。

**足あと帳を消す（管理）**: Cloudflare の「Workers & Pages」→ `takuan-site` →「設定」→「変数とシークレット」で、**`BBS_ADMIN_KEY`** に好きな長い文字列を「シークレット（暗号化）」で入れて再デプロイ。
`https://takuan-site.pages.dev/bbs#kanri` を開くと鍵の欄が出るので、同じ文字列を入れて「消すボタンを出す」。鍵を入れない限り、だれも消せない。

手元で Functions ごと確かめるとき: `node tools/dev-server.mjs`（KV はメモリの中。鍵は `local-test`）。
手元（localhost）だけ、URL に `?kiriban=7777`（お祝い画面）・`?date=2026-12-24&hour=2`（日時）・`?idle=3`（居眠りまでの秒）を付けて見た目を確かめられる。
