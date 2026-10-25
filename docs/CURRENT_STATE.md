# 現在の状態：0.8.6-preview

基準日2026-10-15。`I`＝実装あり、`P`＝部分／試験対応、`N`＝未実装。実装の存在と実機の合否は別。

## 基本情報

|項目|値|
|---|---|
|Android package|`jp.shinwakai.dsbooks.claude`（0.9.0〜Claude版。ChatGPT版 `jp.shinwakai.dsbooks.preview` と共存）|
|versionName / versionCode|`1.0.0-claude` / `75`（ChatGPT版最終は0.8.6-preview / 64）|
|署名|Claude版の新しい鍵 alias `dsbooks-claude`、証明書SHA-256 `27c01a801b8ad5b4c229bf5061b6fd377031ba65f4443f4bc7faafe712d16490`|
|min / target / compile SDK|26 / 34 / 35|
|ビルド|Bash、JDK、aapt、D8 8.9.35、zipalign、apksigner。Gradleなし|
|画面|ローカルHTML/CSS/JS、WebViewブリッジ`DSBooksNative`|
|音声|LibVLC Android 3.7.1、Android TTS、MediaSession|
|CPU|arm64-v8a / armeabi-v7a / x86 / x86_64|
|接続|DSM File Station API。Tailscaleは外部アプリ|
|PC管理|Python GUI/CLI 0.3.1。閲覧用は Windows版 desktop 0.2.0 と Mac版 desktop 0.2.1（`desktop/`、表紙ツールを内蔵）|

## 機能表

|領域|状態|現行の内容・限界|
|---|---|---|
|NAS接続・ログイン保持|I|暗号化した接続情報／SID、2FA入力。2FAコードを保存しない|
|再接続・Tailscale案内|I|前景復帰／オンライン時に再確認、期限切れ時だけ再ログイン。通信失敗と認証待ちを分離。外部Tailscaleを開く。VPNの有無だけでTailscaleを断定しない|
|スキャン・対象フォルダ|I|共有フォルダと直下フォルダ名の接頭辞／完全一致。明示対象の直接列挙、失敗時の前回カタログ保持。対象外の保存済み本は保存済み画面から利用|
|操作部の配置（0.9.0）|I|種類チップ1行、表示切替セグメント、並べ替え・絞り込みの下部シート、本の詳細の主ボタン＋タイル、設定のショートカット＋折りたたみグループ。既存ID・保存値を維持。実機未確認|
|本棚UI|I|木目のフォルダ横棚、フォルダ内折り返し、表紙サイズ、進捗／NEW／音声ジャケット、暗緑ヘッダー・フッター|
|リスト・並べ替え|I|0.8.6：1冊1行、9種類の並べ替え、昇降順、読みかけ優先、端末内設定保存。シリーズスタックで行を隠さない|
|大量蔵書|I|ホーム8棚×12冊、フォルダ／リスト72冊、読書中24冊ずつ。全件検索。起動オーバーレイと再読み込み。12,000件の模擬データ検証あり|
|表紙|P|端末内表紙＋PC生成キャッシュの遅延取得。未DLファイルからの汎用的な部分読み出し・外部書誌取得はない|
|PDF|I|内部表示、スワイプ、ページ、ズーム、シーク、再開、栞・メモ|
|テキストEPUB|I|章内ページ分割、再開、章内検索、本文量で重み付けした概算進捗、文字・行間・色・書体、シーク、縦書き|
|EPUB制限|P|全章の厳密な総ページ数・全書籍検索・完全な階層目次・出版社組版の完全再現は未対応。縦中横の自動調整／原本組方向の自動判定は未実装|
|画像EPUB・CBZ/CBR|I/P|SVG imageのhref/xlink:href、画像専用表示、拡大／パン、左右開き、再開、栞。CBRはRAR4/5の試験範囲。暗号化・破損等はエラー扱い|
|Markdown|P|内部表示とフォント。単体取り込み時に別ファイルの画像を収集しない。Obsidian相対リンク等の完全互換はない|
|EPUB朗読|I/P|表示中本文から開始、追従ページ送り・範囲強調、手動移動後の追従解除／復帰、速度、通知。章をまたぐ自動朗読とプロセス終了後のセッション復帰は未実装|
|音声本|I|M4A/M4Bの内部VLC再生、シーク、速度、15秒移動、章、位置保存、スリープ。音声フォーカス・通知・ミニプレイヤーあり|
|大容量M4B|P|標準MediaPlayer解析失敗を受けVLCへ置換済み。問題ファイルでの最新内蔵版の再生成功は未確認。容量原因と断定しない|
|ストリーミング|P|NAS Rangeを検証するローカルHTTP中継。全DLを待たず再生。「保存しながら聴く」は別通信の並行DL。共通部分キャッシュ／自動ローカル切替はない|
|DL|I/P|前景サービス、通知、一時停止・再開・中止・完了後に開く。0.9.1でサービス内の待機列（順番に自動開始）とダウンロード一覧。待機列はメモリ上のみで、プロセス終了／再起動後の復旧は今後（B04）|
|SD保存先|P|Androidが返すアプリ専用保存先を選択。カード不在で別の場所へ黙って保存しない。任意のSAFフォルダ指定と既存本の移動は未実装|
|同名複数形式|I|同一フォルダ＋拡張子を除いた同名を1冊に。位置は形式ごと。分離／再結合・全体設定あり。PDF添付を再生中に表示|
|シリーズ・タグ・メモ|I|同じフォルダのシリーズスタック・巻一覧・前後巻、タグ、お気に入り、栞、共通メモ。作者のフォルダ横断ジャンプは低優先|
|取り込み・共有|I/P|Androidファイル選択による取り込み、保存済みファイルを他アプリへ送信、任意の出力先へ書き出し。他アプリの共有先としての受信は未実装|
|Obsidianメタデータ|P|PCツールが安定IDとMarkdown、schema 2 catalogを生成。元の本にIDを埋め込まない。改名照合は同一走査範囲かつ一意のハッシュ一致。原本自動リネームなし|
|読書データ同期|P|schema 1 JSON。手動入出力＋使用中の自動同期。初期は無効。端末別2コピー、更新日時でマージ。新規本の登録は別スキャン。バックグラウンド定期同期／時計ずれ競合UIなし|
|セルフテスト|P|保存済み実ファイルの構造・代表ページ・無音デコード・シーク・任意チェックサム等。全ページの視覚確認、実スピーカー、車・TV・Cast成功の判定はしない|
|ウィジェット|I/P|通常一覧＋2列表紙棚、最大200冊、タップ再開。ランチャー実機確認を継続|
|Android TV|P|Leanback起動・十字キー操作の試験対応。専用の完成UIではない|
|Android Auto|P|MediaBrowserServiceで保存済み音声本を公開。最大5,000件／100件単位。未保存NAS音声は対象外。実車未確認|
|Chromecast|P|0.8.0から保存済み音声の直接Cast。端末の限定HTTP配信。同一Wi-Fiと受信側コーデック対応が必要。1倍速。NAS未保存音声、TTS、書籍画面、Cast中の速度／スリープ／表紙は未対応|
|PC/Mac閲覧|I|Windows 0.2.0／Mac 0.2.1（Apple Silicon、未署名）。実機確認はCHECKLIST_DESKTOP_*|
|iOS・NAS常駐|N|iOS/IPAは検討要望のみ。QuickConnectも未対応|

## 確認できた実機報告

- EPUBの読書位置再開：利用者が成功と報告（当該発言だけでは版は特定できない）。
- 31.3MBのM4B：旧版で再生でき、68:50の長さを取得したスクリーンショットあり。
- 約536MiBのM4B：0.5.2診断でサイズ一致、49章取得、MediaExtractor音声トラック0、互換コピー失敗。VLC置換前の証拠。
- 822.1MBの「21 Lessons」：外部VLCで再生できた報告あり。これはDSBooks内蔵版成功の証拠ではない。
- 最新0.8.5／0.8.6の全機能について、実機完了の包括的報告はまだない。

## 1.0.0／desktop 0.2.5／Theta.Jisui.Viewer 0.2.5 のリリース証拠（コミット `3e67d6f`）

- `DSBooks-1.0.0-claude.apk`：109,863,703 bytes、SHA-256 `79963d4c15f9f56633d7eb184160a0062a6b587435e9bec96a900623290e5d1c`（GitHub側のdigestと一致）。ZIP CRC正常、versionCode 75、assets 39件がソースと一致（`page-view.js`・`reader-chrome.js` を含む）、同じ証明書。
- `ThetaJisuiViewer-0.2.5.apk`：96,760,526 bytes、SHA-256 `ea4d48c9bb89ba7bd71cf98d569b553b0f8b4053b25e6653748cc3e664cf6eab`（一致）。`com.theta.jisuiviewer`、versionCode 75 / 0.2.5、assets 38件（秀英体なし）がソースと一致、同じ証明書。
- `desktop-v0.2.5`・`desktop-mac-v0.2.5`・`jisui-viewer-v0.2.5` は CI で作成・公開した。
- 実機未確認。

## Theta.Jisui.Viewer for Android 0.2.4 のリリース証拠（コミット `1ecb3d2`）

- `ThetaJisuiViewer-0.2.4.apk`：96,752,200 bytes、SHA-256 `1993e2f90acb945ad7d2125598a38b380d6ced9cfdb2f2b75ad891e8eaf2f606`（GitHub側のdigestと一致）。
- ZIP CRC正常、package `com.theta.jisuiviewer`、versionCode 74 / versionName 0.2.4、表示名 Theta.Jisui.Viewer、provider `com.theta.jisuiviewer.files`。
- assets 36件が、秀英体を除いたソースと一致する（秀英体なし）。ウィジェット・Android Auto なし、`.jisui` の VIEW フィルターあり、dexに `isViewer` を含む。
- v2/v3署名で、DSBooks Claude と同じ証明書。
- 変更後の build.sh で通常の DSBooks を作っても、パッケージ・表示名・秀英体の同梱が変わらないことを確認した。
- 実機未確認。

## 0.9.9／desktop 0.2.4／Theta.Jisui.Viewer 0.2.4 のリリース証拠（コミット `5291ee0`）

- `DSBooks-0.9.9-claude.apk`：109,855,377 bytes、SHA-256 `7ab560f385639cf012a6ad1eec4b1cbbd1fc4053150e45c754a5d192cd0772dd`（GitHub側のdigestと一致）。ZIP CRC正常、versionCode 74、assets 37件がソースと一致、v2/v3署名、同じ証明書。
- `desktop-v0.2.4`・`desktop-mac-v0.2.4`・`jisui-viewer-v0.2.4` は CI で作成・公開した。
- 内容は、ピンチ拡大の中心を指（PC・Macはカーソル）の位置にする変更。実機未確認。

## 0.9.8／desktop 0.2.3／Theta.Jisui.Viewer 0.2.3 のリリース証拠（コミット `c131ba6`）

- `DSBooks-0.9.8-claude.apk`：109,855,377 bytes、SHA-256 `e34e57abb7fa5e02cd2b4097cb0a9036ace5288099731c70c57ff4c89d83b2b4`（GitHub側のdigestと一致）。ZIP CRC正常、versionCode 73、assets 37件がソースと一致、v2/v3署名、同じ証明書。
- `desktop-v0.2.3`、`desktop-mac-v0.2.3`（dmg `b7c63520…f8033a`）。
- `jisui-viewer-v0.2.3`：Setup `cd3fb4c1…5d3329`、portable `878b8c3b…a091c2`、dmg `575778e2…7d1742`、zip `aa75814c…a9ad9c`。
- 内容は jisui-1 改訂への対応（`theta-book.json`、`mimetype`、目録の `page_offset`）。全部、実機未確認。

## 0.9.7／desktop 0.2.2／Theta.Jisui.Viewer 0.2.2 のリリース証拠（コミット `1c8675e`）

- `DSBooks-0.9.7-claude.apk`：109,855,377 bytes、SHA-256 `ec1b132ea8294fa0bca2f4529e6bb354a8aa5dbbe21ff5ecca267612010b9d1a`（GitHub側のdigestと一致）。ZIP CRC正常、versionCode 72、assets 37件がソースと一致（`jisui.js` を含む）、dexに `JisuiFiles` を含む、マニフェストに `.jisui` 用の VIEW フィルター、v2/v3署名、同じ証明書。
- `desktop-v0.2.2`：Setup 99,992,398 bytes（`0456c2a1…19d0a8a`）、portable 126,379,282 bytes（`4ebb4af7…5d29f07`）。
- `desktop-mac-v0.2.2`：dmg 141,910,973 bytes（`eeb87c1e…4d519e67`）、zip（`ec7f36a6…4599d36`）。
- `jisui-viewer-v0.2.2`：
  - Setup 87,820,195 bytes（`4d215679…5874022`）
  - portable（`e13fc504…4f16a3`）
  - dmg 122,414,565 bytes（`74013927…b80470`）
  - zip（`9a352226…56ea232`）
  - CIで、秀英体を同梱していないこと、exe名だけでビューアモードになること、実際の `.jisui` の読み取りを確認。Mac のジョブは実行環境の割り当て待ちで1回取り消され、再実行で成功した。
- **未解決**：デスクトップ版の配布物が 0.2.0／0.2.1 の約2倍になった（Windows Setup 45→100MB、Mac dmg 68→142MB）。フォントを入れないビューアも同程度なので、依存パッケージ側の増加とみられる。原因を調べるため、CIに同梱物のサイズ一覧を出す手順を追加した（次のビルドから）。
- 全部、実機未確認。

## Claude版 0.9.6 のリリース証拠

`DSBooks-0.9.6-claude.apk`：109,847,124 bytes、SHA-256 `388722b9352a5fbf66084beffc169f1928ed3d69d93eec7983d6709212232336`（GitHub側のdigestと一致）。ZIP CRC正常、versionCode 71／versionName 0.9.6-claude、assets 36件がソースと一致（`digest.js` を含む）、v2/v3署名、同じ証明書。Javaに `saveLocalText` を追加。リリースノートの表の「SHA-256」の見出しが置換ミスでハッシュ値に化けている（APKには影響なし）。実機未確認。

## Claude版 0.9.5 のリリース証拠

`DSBooks-0.9.5-claude.apk`：109,834,774 bytes、SHA-256 `69828dcd4c9d488692cbda50efcff0293cf9c9b3d1a3b69dc07b1d27610c722c`。ZIP CRC正常、package `jp.shinwakai.dsbooks.claude`／versionCode 70／versionName 0.9.5-claude、assets 35件がソースと一致（`md-page-anchors.js` を含む）、v2/v3署名、同じ証明書（`27c01a80…d16490`）。実機未確認。

## Mac版 desktop 0.2.1 のリリース証拠

Release `desktop-mac-v0.2.1`（コミット `5b5aeca`、Actions run 39195467926）。`DSBooks-0.2.1-macOS-arm64.dmg` 68,281,936 bytes、SHA-256 `1be1de309a234ab93473643e68ba1f02a7e678b8eb59c8d6e19826c70d1f0e02`（hdiutil verify 正常）。`DSBooks-0.2.1-macOS-arm64.zip` 59,697,738 bytes、SHA-256 `28c5025d18058dd9eb086eac939bd78b9a9fd89aa90362f9245121e030ab8bd5`。GitHub側のdigestとCIの値が一致。ad-hoc署名（`codesign --verify --deep --strict` 正常）、未公証。CIでソース／.app の起動・ブリッジ・フォント・実ウインドウ起動を確認。Mac実機未確認。

## Claude版 0.9.4 のリリース証拠

`DSBooks-0.9.4-claude.apk`：109,830,607 bytes（署名ブロックの4KB境界詰めで0.9.3と同サイズ）、SHA-256 `d91d54535300c920583780070adb96117ea7bc13d00313c594cb1f404d775f0a`。ZIP CRC正常、versionCode 69、assets 34件がソースと一致、v2/v3署名、同じ証明書。実機未確認。

## Claude版 0.9.3 のリリース証拠

`DSBooks-0.9.3-claude.apk`：109,830,607 bytes、SHA-256 `c825e0807c3436a7398ae9c32b05de6a0dd13332558728f63e9c722b171660f6`。ZIP CRC正常、versionCode 68、assets 34件がソースと一致、v2/v3署名、同じ証明書。実機未確認。

## Claude版 0.9.2 のリリース証拠

`DSBooks-0.9.2-claude.apk`：109,826,447 bytes（署名ブロックの4KB境界詰めにより0.9.1と同サイズ。内容は異なる）、SHA-256 `6c693954475c61f04eaa0e3a0b570f0b4797689e528affab37c5079ef90f287e`。ZIP CRC正常、versionCode 67、assets 33件がソースと一致、v2/v3署名、同じ証明書。実機未確認。

## Claude版 0.9.1 のリリース証拠

`DSBooks-0.9.1-claude.apk`：109,826,447 bytes、SHA-256 `990738206b513effd39c04bae8ad9efc6eddc8213138eef69a9e2d9994da178d`。ZIP CRC正常、package `jp.shinwakai.dsbooks.claude`／versionCode 66、assets 33件がソースと一致、ネイティブ4 ABI、v2/v3署名、0.9.0と同じ証明書（`27c01a80…d16490`）。実機未確認。

## Claude版 0.9.0 のリリース証拠

`DSBooks-0.9.0-claude.apk`：109,822,281 bytes、SHA-256 `9a313e1fa0f4a464fd8311c1249bbdf7d492a15fd455d6e7e2dc48c9f3b86405`。ZIP CRC正常、package `jp.shinwakai.dsbooks.claude`／versionCode 65／label「DSBooks Claude」、provider `jp.shinwakai.dsbooks.claude.files`、assets 32件がソースと一致（ShueiTimes含む）、ネイティブ4 ABI、v2/v3署名、証明書SHA-256 `27c01a801b8ad5b4c229bf5061b6fd377031ba65f4443f4bc7faafe712d16490`。実機での起動・動作は未確認。

## ChatGPT版 0.8.6 のリリース証拠

APK SHA-256：`80c8fa21309201bf4a1d9de8e9118fbf07a735e7fb957d6fdddeed0ce6fb97d3`

サイズ109,809,860 bytes。署名証明書SHA-256：`dc898a4794814c3670408e97aea3a614f883bd7568a3d40cc9856714f6c4fa06`。
