# データ・同期・互換性

## 保存を壊さないための原則

1. 書籍の識別、作品のまとめ、NASパス、端末の保存先は別の概念。
2. パスの変更だけで保存済み本や位置を捨てない。曖昧な同名一致で別の本へ位置を移さない。
3. スキャン失敗/空応答と本の削除を同一視しない。
4. 元のEPUB/PDF/音声を書き換える設計ではない。メタデータはsidecarへ置く。
5. アプリ削除・データ消去を通常の不具合対処として提案しない。

## 読書スナップショット

`library-model.js` の `format: dsbooks-reading`, `schema: 1`, `exportedAt`, `books`。

|区分|主なキー|
|---|---|
|識別|bookId, path, title, type|
|更新管理|progressUpdatedAt, metaUpdatedAt|
|位置|progress, chapterIndex, chapterCount, epubPositions, currentPage, pageCount, audioPosition, audioSpeed, lastReadAt, readState|
|しおり|bookmarkPage, bookmarkChapter, bookmarkScroll|
|整理|series, volume, tags, favorite|
|記録|annotations, workNotes|

`epubPositions` は章の添字から章内0〜1の位置への対応。進捗とメタデータは更新時刻を別々に比較。bookIdまたはpathで対応し、より新しいグループを適用する。注釈・メモはIDと更新時刻で合流し、削除印も扱う。未来時刻・端末時計ずれの競合UIはない。全体のJSONを単純上書きするだけの変更は禁止。

portable exportに認証情報、端末ローカル名、書籍本体を入れない。値の正規化・上限は `library-model.js` が正本。メモ最大500件、本文最大50,000文字、注釈文最大10,000文字等の制約がある。

## 同名異形式

同じフォルダ・拡張子以外が同じファイル名を作品としてまとめる（Unicode NFC正規化）。EPUB/PDF/Markdown/M4A/M4B/CBZ/CBRを対象にし、代表は音声→EPUB→PDF→Markdown等の優先順位。形式別の読書・再生位置を保つ。ユーザーの分離指定を尊重する。同じ書名でも別フォルダなら自動で同一作品にしない。

## PCキャッシュとObsidian

- `_DSBooksCache` にサムネイル・schema 2のカタログ・`metadata/<bookId>.md` を保存する。
- Markdown frontmatter：`bookId`, `file`, `nasPath`, `title`, `series`, `volume`, `tags`。本文の個人メモは再生成で消さない。
- 索引は `contentHash`, `previousPaths`, `mtimeNs`, `metaUpdatedAt`, `metadata` なども保持する。実際の生成例・正確なJSON形はPCツールとテストを参照。
- bookIdはUUID。サイズ+mtimeNsが同じならハッシュの再計算を省く。改名照合は、同一ハッシュの旧パスが一つだけ消えている等の条件を使う。元ファイルを残したコピーは別IDになる。
- キャッシュは通常のJSON/Markdownであり、専用のObsidianプラグインやデータベースは必要ない。Obsidian Syncサービスとの連携を実装したわけではない。
- 現行PC索引はPDF/EPUB/M4A/M4B対象。Androidの対応拡張子と同じではない。表紙最大辺480px。
- Android側のPC索引反映は登録済み本を対象とし、未登録本を自動追加するフルスキャンの代わりにはならない。

## NAS自動同期

既定はオフ。選択したroot下に `_DSBooksSync/reading-<deviceId>-<sequence%2>.json` を保存する。端末ごとの2世代を交互に使い、schema 1にdeviceIdとsequenceを加える。端末別の新しいsequenceを選び合流する。

- アプリ起動後、約60秒周期、変更後約5秒のdebounce、オンライン復帰/アプリ復帰で実行する。
- リーダー表示中や音声再生/準備中は延期する。アプリ完全終了中の常時同期ではない。
- NASの一覧/ダウンロード/フォルダ作成/アップロードAPIを使い、書込後の読み返しを検証する。
- 同期対象外の本はアーカイブに保持するが、一覧へ新規登録しない。
- 読込制限：1 JSON約8MiB、合計約16MiBの文字予算、50,000 books、64 snapshot、フォルダ一覧512件、応答timeout約25秒。厳密な単位/境界は `nas-sync.js` を確認する。
- 同期中に設定が変わったら古い結果を適用しない。失敗時はローカル変更を保留する。

## 端末保存

Web側localStorageとJava側SharedPreferences/アプリ専用ファイル領域を使用。保存キー索引は `reference/storage-keys.json`（静的リテラルの抽出。動的生成キーの完全一覧ではない）。

SD選択は `getExternalFilesDirs` のアプリ専用領域。任意SAFフォルダ選択とは違う。保存場所トークンを記録し、SDが外れた時に別の保存先へ黙って切り替えない。既存ファイルを自動移動しない。アプリをアンインストールするとアプリ専用データが消える可能性があり、allowBackupはfalse。

NASの保存認証情報はネイティブ側で暗号化。スナップショット/共有ファイル/診断にパスワードやSIDを混ぜない。
