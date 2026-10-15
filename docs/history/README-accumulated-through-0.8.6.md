## 0.8.6-preview

本棚／リスト表示切り替え、9項目の並べ替え、昇順／降順、読みかけ優先。表示設定は端末内で保存します。リストは72冊ごとに表示し、検索・集計は全件対象。詳細はCHECKLIST_DEVICE_0.8.6.mdを参照。

## 0.8.5-preview

NASセッションの前景時自動再接続、Tailscale起動案内、テキストEPUBの縦書き／横書き切り替え。CHECKLIST_DEVICE_0.8.5.mdを参照。

## 0.8.4-preview

添付ShueiTimes.ttfを内蔵。EPUB「文字・色」およびMarkdownのフォント選択に「Shuei Times（内蔵）」を追加。初回ロード完了を待ってページを配置。既存フォント設定は変更しません。

## 0.8.3-preview

- EPUB（画像／テキスト）、CBZ、CBR、PDFの下部に確定時ジャンプのシークバーを追加。
- EPUBテキストとMarkdownに端末内蔵フォント選択（明朝／ゴシック／等幅）を追加。
- フォント変更時は直前の本文文字位置を保つ。フォント設定は端末に保存。
- CHECKLIST_DEVICE_0.8.3.mdを参照。Android実機は未検証。

# DSBooks 0.8.2-preview

SVG画像を含むEPUBコミックの白紙表示を修正し、CBZ／CBR（RAR4・RAR5）の内部閲覧を追加しました。コミックの拡大・ページ送り・再開・栞・共有・サムネイルに対応します。0.8.1の対象フォルダ除外修正を引き継ぎます。
実機確認は `CHECKLIST_DEVICE_0.8.2.md`、自動確認は `notes/AUTOTEST_0.8.2.md` を参照してください。

ビルド：Android SDK platform 35 / build-tools 35.0.0、Java 17以降、Python 3。`ANDROID_HOME` と既存の署名鍵を配置し `build.sh` を実行します。署名鍵・パスワードはソースZIPに含めません。
ソースZIPには依存バイナリ（AAR/JAR）を含めません。ビルド時に取得し、`third_party/androidx/DEPENDENCIES.json` とスクリプト内のSHA-256で検証します。D8コンパイラは `tools/prepare-compiler.py` が固定バージョンを検証して取得します。`resolve-cast-dependencies.py` は依存更新用の保守コマンドであり通常ビルドには不要です。

## 0.7.0-preview（versionCode 57）

表示ページからのEPUB朗読、通常ウィジェットの表紙表示と設定からの追加、保存済み読みかけ本の表紙生成、Android TVの方向キー操作とランチャー、Android Autoの保存済み音声本ブラウザ／再生位置保存を追加。通知とメディアセッションにも取得済み表紙を渡す。

TV／Android Autoは試験対応で実機未確認。Autoの掲載は最大5,000件・100件ごとで、車側の選択は保存済み音声本のみ。プレビューAPKのAuto表示には開発者設定が必要な場合がある。Castは標準の画面共有設定を開く導線のみで、Chromecastへのメディア直接送信は未実装。TTSの次章自動朗読やページ追従も未実装。

更新用APKは従来と同じ署名。CHECKLIST_DEVICE_0.7.0.mdに実機チェックと制限、notes/AUTOTEST_0.7.0.mdに自動確認を記録。

ビルドは従来どおり build.sh。Android SDK platform 35、build-tools 35.0.0、Java、Python、署名鍵が必要。依存ライブラリはthird_partyに同梱。秘密鍵はこのソースZIPに含めない。

参考仕様：
- https://developer.android.com/training/cars/media/create-media-browser
- https://developer.android.com/training/tv/get-started/create
- https://developer.android.com/develop/ui/views/appwidgets/collections
- https://developers.google.com/cast/docs/android_sender/integrate

## 0.6.2-preview（versionCode 56）

Androidの戻る操作でフォルダ一覧から本棚ホームへ戻るよう修正。0.6.1の折り返し一覧を継続し、表紙サイズ・並べ順の保存、実数集計、絞り込み解除、本棚位置の復元、同じフォルダのシリーズ前巻／次巻／巻一覧を追加。
上書き更新用APKは従来と同じ署名です。CHECKLIST_DEVICE_0.6.2.mdを参照。
自動テスト：tests/navigation-0.6.2.cjs、tests/folder-grid-0.6.1.cjs。Androidの戻るボタン／ジェスチャー実機確認は未実施です。

## 0.6.0-preview（versionCode 54）

読書中の全件一覧／表紙つきスクロールウィジェット／アプリ使用中のNAS自動同期／実ファイルセルフテストを追加。
設定と制限、実機確認はCHECKLIST_DEVICE_0.6.0.mdを参照。

自動同期は初期状態で無効。同期先NASフォルダと任意のPC索引パスを設定する。設定したフォルダの `_DSBooksSync` に端末別2コピーを作り、他端末の進捗を統合する。PCのObsidian Markdownを変更した場合は、PCツールでcatalog.jsonを再生成する。アプリ終了中の定期実行は未対応。

実ファイル検査は元ファイルと読書位置を変更しない。音声デコードは独立したLibVLCのdummy出力で行い、スピーカー／Bluetoothの動作とは区別する。PDF・EPUBの表示検査は代表ページ／章であり、全ページの見た目を保証しない。

開発用テスト：tests/features-0.6.0.cjs、tests/sync-0.6.0.cjs、tests/EpubInspectionTest.java。既存のmodel/storage/streaming/UI回帰テストも継続。EpubInspectionTestの第1引数に任意のEPUBパスを指定すると実ファイルを検査する。個人の実サンプルEPUBはソースZIPには含めない。
自動検証の記録：notes/AUTOTEST_0.6.0.md。

参考仕様：
- https://developer.android.com/develop/ui/views/appwidgets/collections
- https://global.download.synology.com/download/Document/Software/DeveloperGuide/Package/FileStation/All/enu/Synology_File_Station_API_Guide.pdf

## 0.5.5-preview（versionCode 53）

設定 → ダウンロード・取り込みの保存先 → 本体またはSDカードのDSBooks専用フォルダ → この保存先を使う。
選択は今後のダウンロード／取り込みに適用。以前の保存済み本は元の場所から開き、実行中のダウンロードの保存先は変えません。
SDカードが外れている場合は保存を止め、本体へ自動保存しません。再挿入後に設定の「再確認」で本の利用状態を更新できます。
自由なフォルダ指定・既存ファイル移動は未対応。専用フォルダはアプリのアンインストールで削除されます。
既存アプリへ上書き更新してください。実機チェックはCHECKLIST_DEVICE_0.5.5.md。

自動テスト：tests/BookLocationTest.java、tests/storage-0.5.5.cjs。実SDの動作確認は含みません。
前版のLibVLC内蔵・NASストリーミング・並行保存を継続します。

## 0.5.4-preview（versionCode 52）

NAS上のM4A/M4Bを、全体の保存完了を待たずに内蔵VLCで再生する選択肢を追加。
「保存しながら聴く」は再生とバックグラウンド保存の並行処理です。通信は別で重複します。
保存完了後は再生画面から端末内ファイルへ手動切替できます。
実NASのRange対応と実音声出力は未確認。CHECKLIST_DEVICE_0.5.4.mdを参照してください。

HTTP中継のテスト：JDKでNasAudioSource.javaとtests/NasAudioSourceTest.javaをコンパイルし実行。
画面テスト：tests/streaming-0.5.4.cjs。模擬ブリッジであり、実デコードのテストではありません。
署名は従来と同一。ソースZIPに署名鍵や認証情報は含めません。

## 0.5.3-preview（versionCode 51）

LibVLC Android 3.7.1を内蔵。外部VLCなしでM4A/M4Bをアプリ内再生します。
0.5.2の互換コピーを直接再生に置き換えました。実ファイルでの再生成功は未確認です。
実機確認は CHECKLIST_DEVICE_0.5.3.md を参照。

ビルドはAndroid SDK 35、Java、Python3、zipが必要。third_partyの固定依存物を同梱し、SHA-256照合後にビルドします。署名鍵はソースアーカイブに含めません。
ライセンス・対応ソースの案内：app/src/main/assets/licenses/NOTICE.txt。

## 0.5.2-preview（versionCode 50）

大容量M4B失敗時の音声トラックのみの互換コピー、再試行、詳細診断、外部VLC起動を追加。
既存と同じ署名で上書き更新。実ファイルでの再生成功は未確認です。
実機チェックは `CHECKLIST_DEVICE_0.5.2.md`、計画は `ROADMAP.md` を参照。

# DSBooks Preview 0.5.1 prototype

Android prototype for connecting to a Synology DSM over Tailscale and indexing selected File Station shares.

全画面リーダー・ページ位置に揃えたEPUB再開・読書画面中のミニプレイヤー非表示・スマホ幅のコンパクト操作・ズーム操作、EPUB内画像の独立拡大と高解像度画像の読み込み改善、保存済み本の表紙表示に加え、未ダウンロード本向けにPC生成のNASサムネイルを棚の表示範囲だけ取得する機能を追加しました。今後の実装順とウィジェット対応の計画は [ROADMAP.md](ROADMAP.md) を参照してください。

読みかけの本を最大3冊表示するホーム画面ウィジェットを追加しました。各行をタップするとDSBooksを開いて、その本を続きから開きます。ウィジェットの一覧はアプリ内の蔵書データから更新します。

## 0.5.1追加機能

セルフテストと匿名診断レポート、同一フォルダの同名複数形式をまとめる書籍表示、音声章一覧、再生画面内の添付PDF、共通の書籍メモ、見つけやすいファイル共有。操作と制限はCHECKLIST_DEVICE_0.5.1.mdを参照。

自動テストはNode.js＋Playwright（PLAYWRIGHT_MODULEとTEST_CHROMIUMで任意の配置を指定可）、Java章解析テストは通常のJDKで実行できます。Nero chplのデータ形式確認には https://ffmpeg.org/doxygen/7.1/mov_8c_source.html を参照しました。FFmpeg本体は同梱していません。

## 0.5.0追加機能

章・ページ移動、章内検索、複数栞／メモ、読書テーマ、シリーズ／タグ／お気に入り、スリープタイマー、端末内ファイル取り込み、手動JSON受け渡し、PC側Obsidianメタデータを追加。詳細はCHECKLIST_DEVICE_0.5.0.mdを参照。NAS自動同期は未実装です。

## Included in this phase

- Folder-preserving horizontal bookshelves, with read-in-progress books and recently modified items placed first
- Compact dark forest-green interface with clearer contrast and vinyl-jacket styling for audiobooks
- Lazy retrieval and Android-side caching of thumbnails generated by the PC helper

- DSM connection with the supplied Tailscale IPv4 as the default address
- DSM username/password and optional one-time verification code
- Shared-folder selection and DSM-side recursive search for PDF, EPUB, Markdown, M4A, and M4B files
- Local caching of the catalog metadata on the Android device
- Download selected books through DSM's File Station API into app-private storage
- Offline open for downloaded PDFs in the app, including page navigation and local page-position saving
- Basic Markdown display for downloaded notes
- In-app EPUB chapter reader
- EPUB paginated reading with horizontal swipe page turns and saved page position
- EPUB text-to-speech using Android's installed Japanese voice, with adjustable speed
- PDF horizontal swipe page turns (swiping is disabled while zoomed in)
- In-app M4A/M4B playback with seek, skip, variable speed, and embedded `chpl` chapter navigation when available
- Optional encrypted DSM credential/session retention using Android Keystore; one-time verification codes are never stored
- Installed app version shown in the top bar
- Android XML parser compatibility fix for EPUB files with standard DTD declarations
- Direct listing inside explicitly scoped folders; retain previous catalog entries if a NAS scan no longer sees them
- Save selected library folder and prefix so the sync button reuses the same search scope
- Check device storage before downloads and explain DSM session expiry (API 119)
- Background downloads in a foreground service with progress notification, pause, resume, and cancel controls

Version 0.5.0 aligns EPUB columns and saved locations to page boundaries, hides the audio mini player while a reader is open, and compacts the mobile reader toolbar. Please verify with the device checklist.

This remains an early prototype. Reading and playback position are saved on this Android device only; automatic NAS progress synchronization and Android Auto are not implemented yet. Remote cover thumbnails appear after the PC helper has created `_DSBooksCache` in the selected DSM folder. Embedded M4B chapter tracks are shown when they use the supported `chpl` metadata. DSM may still require a fresh one-time verification code after its session expires. Audiobook and EPUB narration now use an Android media playback service with notification/lock-screen controls and a mini player; verify behavior on the target phone. Downloads, thumbnail cache, and encrypted credentials are stored on this Android device and are removed if DSBooks is uninstalled.

## NAS cover thumbnail cache

Install Python 3, then install the helper's dependencies:

```sh
python -m pip install Pillow PyMuPDF mutagen PyYAML
```

Run this on a PC that can access the NAS share as a mounted folder. `source` is the PC-visible folder; `--nas-root` must be the same folder's DSM File Station path (for example, `/8Books/⑧カメラ`).

```sh
python tools/dsbooks_thumbnails.py "Z:\\Books\\⑧カメラ" --nas-root "/8Books/⑧カメラ"
```

The helper writes `_DSBooksCache/catalog.json` and small JPEG covers under `_DSBooksCache/thumbs`. It skips regenerating unchanged files, does not modify original books, and does not contact external services. Run it again after adding or replacing books. In DSBooks, sync the NAS catalog; covers load only as their shelf cards scroll into view. Files without an embedded cover keep the generated fallback card.

## Install

Enable Tailscale on the Android device, install the APK, and connect to the DSM Web API address. The default is `http://100.100.85.33:5000`. Use a dedicated DSM user with File Station read permissions limited to the library shares. If you already installed the earlier 0.1.0 APK, uninstall it first because that build used a different signing key.

## Rebuild

Requires Python 3, Java/keytool, and Android SDK platform 35/build-tools 35.0.0.

```sh
export ANDROID_HOME=/path/to/android-sdk
./build.sh
```

The DSM authentication request uses the File Station documented Auth API v3 when available. Library scanning uses the DSM-side File Station Search task on selected shares instead of listing every directory from the phone. Multiple patterns use the DSM Search API's documented separator. The foreground Activity hosts a JavaScript bridge for streaming downloads, offline file checks, and PDF page rendering.

This preview uses the package ID `jp.shinwakai.dsbooks.preview` and the existing signing key so it can update earlier preview APKs in place. Keep `build/dsbooks-0.2.0.keystore` private and backed up. The build uses the Java compiler bundled with the local JDK and Android SDK platform 35/build-tools 35.0.0.

CBR読込：Junrar 8.1.2 / SLF4J 2.0.17を固定・ハッシュ検証して利用。ライセンスは app/src/main/assets/third-party/ に同梱。RAR圧縮機能は実装していません。
