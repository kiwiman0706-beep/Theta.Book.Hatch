# 構成とコード案内

## 全体

Android JavaのActivity/ServiceとWebView内HTML/CSS/JavaScriptの組み合わせ。一般的なGradle/React/Capacitorプロジェクトではない。画面・カタログ・読書位置はWeb側、ファイル/音声/通知/共有/ウィジェット/外部機器はJava側が担当する。

|層|ファイル|責務|
|---|---|---|
|画面入口|`app/src/main/assets/dsbooks-prototype.html`|本棚、検索、NAS登録、スキャン、基本表示、従来実装|
|起動・件数制限|`startup.js`, `library-pages.js`|初期描画を抑え白画面回避。全データは保持|
|一覧・移動|`library-list.js/css`, `library-navigation.js`, `reading-shelf.js`|0.8.6リスト切替、並べ替え、戻る、読書中一覧|
|データ|`library-model.js`, `work-model.js`, `work-library.js`|位置/メタデータ、同名異形式の作品、関連メモ|
|EPUB/TTS|`epub-reader.js`, `epub-speech.js`|独自ページ分割、文字/縦書き、位置・朗読追従|
|コミック|`comic-reader.js`|画像EPUB/CBZ/CBR、ズーム/移動/方向|
|NAS|`nas-connection.js`, `nas-sync.js`|再接続/2FA案内、JSON自動同期・PC索引反映|
|音声・外部機器|`audio-streaming.js`, `cast-audio.js`, `device-integration.js`|再生UI、ストリーミング、Cast/TV/Auto連携|
|その他|`enhancements.js/css`, `download-storage.js`, `diagnostics.js`|拡張UI、保存先、診断|

資産ファイルの実際の置き場所はすべて `app/src/main/assets/`。歴史的に機能がHTML本体と拡張JSの両方にあるため、名前だけで編集箇所を決めない。

## ネイティブ

`app/src/main/java/jp/shinwakai/dsbooks/preview/`を起点に探す（正確なパスはファイルツリーを参照）。

|クラス|役割|
|---|---|
|MainActivity|WebView、JavaScript bridge、戻る・ライフサイクル、認証情報の暗号化保存|
|MediaPlaybackService / SpeechCursor|LibVLC再生、TTS、MediaSession/通知、発話範囲・位置|
|BookDownloadService / BookStorage / BookLocation|バックグラウンドDL、保存領域、内部/SD位置トークン|
|NasAudioSource|NAS認証とRange音声入力|
|AudioCompatibility|旧標準パーサ用互換処理。現行LibVLC経路とは区別|
|EpubContent / EpubInspection|EPUB ZIP/XML/画像内容と診断|
|ComicArchive / IsoChapterParser|CBZ/CBR展開、M4Bチャプター解析|
|CastAudio / CastFileServer / CastRelayService / DSCastOptions|Castセッションと受信機向けローカル音声HTTP配信|
|CarLibrary / CarBrowserService|Android Auto向け保存済み音声一覧と再生|
|ReadingWidgetProvider / RichReadingWidgetProvider / ReadingWidgetService|通常/サムネ付きウィジェット|
|DocumentExchange / LocalBookProvider|共有・外部ファイル連携|
|DeviceDiagnostics / FileExercise|診断JSON・保存済みファイルの機械検査|

橋渡し公開メソッドの索引は `docs/reference/native-bridge.md`。ファイル引数・URI・例外の仕様は実装と呼び出し元を対で読むこと。

## 読み込み順は仕様の一部

HTMLで `library-pages.js` が先に読み込まれ、後続は概ね次の順：
`library-model → enhancements → epub-speech → epub-reader → comic-reader → work-model → work-library → diagnostics → audio-streaming → download-storage → reading-shelf → nas-sync → library-navigation → device-integration → cast-audio → nas-connection → library-list → startup`。

拡張ファイルは既存関数をラップ/差し替える。順番を変更すると再描画、保存、朗読、戻るが壊れることがある。`DSBoot.loading` 等の起動制御を維持する。単一モジュールの単体検査だけで完成扱いにしない。

## 代表的な流れ

- 本棚：ローカルカタログを読み込み → 件数制限付き描画 → NAS状態確認 → 必要時スキャン/同期 → 既存bookId・オフライン状態を保持して更新。
- 読書：ファイルの保存状態確認 → ネイティブが内容を取得 → WebViewにページ表示 → 位置保存 → 同期対象のJSON生成。
- 音声：保存済みまたはNAS入力 → foreground serviceのLibVLC → UI/ミニプレイヤー/通知が同じ状態を操作。
- Cast：保存済み音声 → 端末のHTTPサーバー → 同一LANの受信機が取得。NASのログイン情報をCast機器に渡す方式ではない。
- PC補助：フォルダ走査 → 表紙/メタデータを `_DSBooksCache` に生成 → Androidがキャッシュを読む。常駐NASサーバーは必須ではない。

## PCツール

`tools/dsbooks_thumbnails.py`, `dsbooks_metadata.py`, `dsbooks_thumbnail_gui.pyw` と `thumbnail-helper-release/` に配布用コピーがある。現行3ファイルは同内容。改修時は両方を更新し差分検査する。後で共通化するなら配布方法も同時に直す。
