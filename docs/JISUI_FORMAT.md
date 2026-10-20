# `.jisui` コンテナ `jisui-1`（DSBooks／Theta.Jisui.Viewer 側の写し）

FullOCR の Vault（複数の MD・画像・任意でダイジェストと原典PDF）を1ファイルにまとめる形式。仕様の正本は FullOCR 側にあり、利用者から受け取った（2026-10-20）。0.9.7（Android）、desktop 0.2.2、Theta.Jisui.Viewer 0.2.2 で読み取りを実装した。関連仕様は `fullocr-1`（`docs/FULLOCR_PAGE_ANCHORS.md`）と `theta-digest-1`（`docs/THETA_DIGEST.md`）。

## 仕様の要点

- 中身は ZIP。ルートに `jisui.json`（`format: "jisui-1"`、`entry`、`pdf`、任意で `title` / `author` / `page_anchors` / `digest` / `isbn` など）を置き、Vault 一式（`00_index.md`、章MD、`attachments/`、`_digest.md` ほか）は相対パスのまま入る。
- `pdf.mode` は3種類。
  - `embedded`：ZIP内の `pdf.name`。
  - `sidecar`：`.jisui` と同じフォルダの `pdf.sidecar`（= 同じベース名＋`.pdf`）。`pdf.name` は MD リンクが参照する論理名。
  - `none`：PDFなし。
- `#page=N` は物理ページ（1始まり）。
- 拡張子の登録はビューアのインストーラが行う。
  - MIME：`application/x-jisui`
  - Windows：`HKCU\Software\Classes\.jisui` → ProgID `Theta.Jisui`
  - macOS：UTI `com.theta.jisui`

## 実装

|項目|内容|
|---|---|
|メンバーの指定|`<.jisui の localName>\n<ZIP内パス>`。ネイティブの `readText` / `hasBook` / `renderPdfPage` がこの形を受け付ける。追加したのは `jisuiEntries`（一覧）と `jisuiImage`（画像のdata URL、8MBまで）。`..` や絶対パスは拒否する|
|PDF|埋め込みPDFは、キャッシュに一度だけストリームで書き出してから描画する（Android は PdfRenderer、PC は PyMuPDF）。丸ごとメモリに読まない。キャッシュは最近の数冊分だけ残す|
|開く（JS `jisui.js`）|`jisui.json` を確認し、MD・PDFを本棚に出ない「メンバー」として登録する（`jisuiOf`、同じ `digestDir`）。`entry` を開き、次からは最後に読んだ章を開く。書名・著者は目録から取る|
|章リンク・ページ・ダイジェスト|メンバーは1つのフォルダの本として扱うので、`[[章#見出し]]`、「原文 p.N」、PDF→本文、`_digest.md` の表示がそのまま動く。メンバーは `fileName` で論理名を持つ|
|原典PDFの解決|`embedded` はZIP内。`sidecar` は次の順に探す。①PC：`.jisui` を開いた場所の隣（`jisuiSidecar`）、②NAS：同じフォルダの `pdf.sidecar`、③端末に取り込んだ同名PDF。`none` は「原文PDFが入っていません」と表示する|
|画像|`![[名前]]`（Vault 内のどこにあってもよい）と `![](相対パス)` を、ZIP内から読んで表示する|
|書き込み|`.jisui` には書き込まない。読書位置・章・メモ・AI要約はアプリ側に保存する。PC で開いたままの `.jisui` を本棚から「削除」しても、一覧から外すだけで元ファイルは消さない|
|開き方|Android は「アプリで開く」（ACTION_VIEW。内容が分からない時は ZIP／不明形式も受けて、拡張子で判定）で取り込んで開く。PC/Mac はダブルクリック・引数・2回目の起動（`/open`）で、その場で開く。macOS は `application:openFiles:` と argv emulation で受ける|
|NAS|スキャン対象に `*.jisui` を追加。本棚では1冊（種類 JISUI）|

制約：
- Android で `sidecar` を使う時、「アプリで開く」では隣のファイルを読む権限がもらえない。PDF を ZIP に入れるか、そのPDFを「端末の本を追加」で取り込む必要がある。
- MD は1ファイル4MBまで。
- `.jisui` の表紙サムネイルはまだ作らない。
