# 復元したバージョン履歴

0.9.0以降はClaude版（別パッケージ `jp.shinwakai.dsbooks.claude`、別署名鍵）。基準は0.8.6-preview。公開日/コミット日時は不明なため推測しない。成果物の作成日時は保存時刻でありリリース日ではない。機能の世代と厳密な差分を区別する。個別版の詳細は同梱チェックリストと過去スナップショットを参照。

|版|versionCode（確認値）|主要変更/確認できる範囲|根拠・留保|
|---|---|---|---|
|1.0.0-claude / desktop 0.2.5 / Theta.Jisui.Viewer 0.2.5（PC・Mac・Android）|75|全画面の読書：読書画面のバーをページの上に重ね、ページ中央のタップ（PCはマウスを上下の端へ）で表示、数秒で自動的に隠れる（キーボードでのページ送りが効くよう、消さずに透明にする）。設定で常時表示に戻せる。PDF とコミックを共通のページ表示（`page-view.js`）に：1ページ／見開き（表紙を単独にするか選択、右開き・左開き）／縦スクロール、ページ全体／幅に合わせる、端のタップでめくる、本ごとに保存、初期設定にもできる。縦スクロールは画面の近くのページだけ画像を持つ。コミックはネイティブが最新の依頼だけに答えるため、ページを1枚ずつ依頼する。|ソース/tests/reader-view-1.0.0.cjs/CHECKLIST_DEVICE_1.0.0.md|
|Theta.Jisui.Viewer for Android 0.2.4|74|Android版ビューア（`com.theta.jisuiviewer`）。同じコードを `DSBOOKS_VARIANT=viewer` でビルドし、名前・ID・ファイル提供元を分け、ウィジェットと Android Auto を外し、秀英体を入れない（`tools/make-viewer-variant.py`）。ネイティブの `isViewer`（パッケージ名で判定）で NAS 部分を隠す。署名は DSBooks Claude と同じ鍵。|ソース/build.sh/tools/make-viewer-variant.py/CHECKLIST_VIEWER_ANDROID_0.2.4.md|
|0.9.9-claude / desktop 0.2.4 / Theta.Jisui.Viewer 0.2.4|74|ピンチでの拡大縮小を、指の位置を中心に行うように（従来は左上が起点）。拡大前に指の下にあった要素とその中の位置を覚え、拡大後も同じ所が指の下に来るようにスクロールする（文章が折り返し直されても段落がずれない）。PCのトラックパッドのピンチ（Ctrl＋ホイール）と、Macのジェスチャーにも対応し、カーソルの位置を中心にする。PDF・Markdown・コミック・EPUBの画像表示で共通。|ソース/tests/pinch-zoom-0.9.9.cjs/CHECKLIST_DEVICE_0.9.9.md|
|0.9.8-claude / desktop 0.2.3 / Theta.Jisui.Viewer 0.2.3|73|jisui-1 の改訂に対応：目録名 `theta-book.json`（旧草案の `jisui.json` も読む）、先頭の `mimetype`、目録の `page_offset`（00_index.md の front-matter に無い時の既定値）。テスト用の ZIP を規則どおり（mimetype を先頭・無圧縮、PDF・画像は無圧縮）に作るように変更。|ソース/docs/JISUI_FORMAT.md/tests/jisui-0.9.7.cjs/tests/desktop-jisui-0.9.7.cjs|
|0.9.7-claude / desktop 0.2.2 / Theta.Jisui.Viewer 0.2.2|72|`.jisui`（jisui-1）対応：FullOCR の Vault を1ファイルにまとめた ZIP を開き、目次・章リンク・挿絵・原文PDF（同梱／隣／なし）・ダイジェストをそのまま利用。メンバーは本棚に出さず、`.jisui` は書き換えない。Android は「アプリで開く」に対応、NAS スキャンに `*.jisui`。PC は `.jisui` をその場で開き、削除しても元ファイルは消さない。Theta.Jisui.Viewer：同じアプリのビューアモード（NASなし、ポート47818、データ別、秀英体なし、`.jisui` 関連付け、2回目の起動でファイルを渡す、macOS の openFiles）。FullOCR 同梱手順 `docs/FULLOCR_BUNDLING.md`。|ソース/docs/JISUI_FORMAT.md/CHECKLIST_DEVICE_0.9.7.md/CHECKLIST_VIEWER_0.2.2.md/tests/jisui-0.9.7.cjs/tests/desktop-jisui-0.9.7.cjs/.github/workflows/release-jisui-viewer.yml|
|0.9.6-claude|71|Theta ダイジェスト（`theta-digest-1`）：FullOCR／このアプリの `_digest.md` を要約・マインドマップ・一問一答のタブで表示し、各項目から原文PDFのページ・本文の見出しへ移動。FullOCRの本の読書画面に「✦ AI要約」：利用者の Gemini API キーで節ごとに要約を作成し（同意画面の後だけ送信、ページはアプリ側の値）、端末に保存して同じフォルダの本棚へ。設定に「AI要約」グループ（キー・モデル）。ネイティブに `saveLocalText`（アプリが作ったテキストを端末の保存先へ）。|ソース/docs/THETA_DIGEST.md/CHECKLIST_DEVICE_0.9.6.md/tests/digest-0.9.6.cjs|
|0.9.5-claude|70|FullOCR ページアンカー（`fullocr-1`）対応：Markdown内の `<!-- fullocr:page pdf=N print="…" -->` を非表示にし、読書画面に「原文 p.15」（印刷ページ→`page_offset`計算→PDF通し）。押すと同じフォルダの原PDF（`00_index.md` の `pdf_file`、なければ `*_text.pdf`／唯一のPDF）をそのページで開く。PDFから「本文へ」で章ファイルをまたいで同じページの本文へ。Markdown全般：front-matter・HTMLコメント・`%%`コメントを非表示、`[[wikilink]]` で同じフォルダの章へ移動。|ソース/docs/FULLOCR_PAGE_ANCHORS.md/CHECKLIST_DEVICE_0.9.5.md/tests/md-anchors-0.9.5.cjs|
|desktop 0.2.1（Mac）|—|Mac 版の最初の配布（Apple Silicon、.dmg／.zip、未署名・未公証、ad-hoc署名）。ログイン情報を macOS キーチェーンに保存（失敗時は権限600のファイル）。Dock クリック・Finder からの再起動で本棚を前面に、⌘Q で終了（バックグラウンド時も）、⌘[ で戻る、⌘W で本のウインドウを閉じる。表紙ツールの .pyw を Windows 以外でも読み込めるように。Info.plist にローカルネットワーク利用の説明。Windows 版はこの版では配布しない。|ソース/CHECKLIST_DESKTOP_MAC_0.2.1.md/desktop/test_credentials.py/.github/workflows/release-desktop-mac.yml|
|0.9.4-claude|69|NASに一度も接続していない新しい状態で「端末の本を追加」が失敗する不具合を修正（`remoteMode` 未宣言）。Windows版と共通の画面の更新（PC専用メニュー項目はAndroidでは表示しない）。|ソース/CHECKLIST_DEVICE_0.9.4.md|
|desktop 0.2.0|—|本ごとの別ウインドウ（同じ本は既存ウインドウを前面に）、DeskHatchドロワー対応（`http://127.0.0.1:47817/`、本は別ウインドウで開く）、本棚・読書位置をアプリ側で一元管理しウインドウ間・ドロワーで即時共有、ページごとの応答振り分け、バックグラウンド起動（起動時オプション、2回目の起動で本棚を前面に、☰から終了）、Shuei TimesをCIで最新Android版APKから取り出して同梱（SHA-256照合）、朗読の速度変更を修正、ダウンロード記録（download.log）。|ソース/CHECKLIST_DESKTOP_0.2.0.md/tests/desktop-0.2.0.cjs|
|desktop 0.1.0|—|Windows版の最初の配布。Android版と同じ画面をWebView2で表示し、Pythonでブリッジ（NAS中継・ダウンロード待ち・EPUB移植・PDF/CBZ・表紙・DPAPI保存）を実装。表紙キャッシュ作成ツールを同じexeに統合。共通画面の不具合修正：NAS未接続の新規状態で「端末の本を追加」が `remoteMode` 未定義で失敗していた（Android版も次の版で反映）。|ソース/CHECKLIST_DESKTOP_0.1.0.md/tests/desktop-0.1.0.cjs/.github/workflows/release-desktop.yml|
|0.9.3-claude|68|右開き指定の小説EPUBで、画像だけの表紙ページのスワイプ方向が本文と逆だったため、表紙⇄タイトルを往復して先へ進めなかった不具合を修正。文字中心の本では画像ページも本文と同じ方向でめくる（画像だけの本は従来どおり）。スワイプ方向の設定（自動／右→左で次／左→右で次、EPUB・コミック共通）。上部の黒いバーを常に表示し、☰メニュー（本棚ホーム・最近・保存済み・音声本・ダウンロード・NAS再接続・蔵書更新・同期・Tailscale・Secure SignIn・接続設定・本の追加・設定）を追加。ロゴで本棚ホームへ。登録済みならNAS登録ボタンと説明文を隠す。|ソース/CHECKLIST_DEVICE_0.9.3.md/tests/epub-swipe-0.9.3.cjs|
|PCツール 0.3.1|—|表紙キャッシュ作成ツールをWindowsインストーラー（.exe）とMac版（.app）としてGitHub ActionsでビルドしてRelease `helper-v0.3.1` で配布。Mac用フォント・設定保存先、画面に版表示。PC/Mac版ビューワーとの統合計画 `docs/DESKTOP_PLAN.md`。|ソース/.github/workflows/release-pc-helper.yml|
|0.9.2-claude|67|本棚（ホーム・フォルダ・リスト・横並び）の表紙に、保存中は円形の進捗リング（%・一時停止表示）、待機中は「↓ 待ち n番目」の帯を表示。読書の進捗バーとは別表示。|ソース/CHECKLIST_DEVICE_0.9.2.md/tests/downloads-0.9.1.cjs|
|0.9.1-claude|66|ダウンロード中に別の本の詳細へ進捗が出る不具合を修正。2冊目以降はサービス内の待機列に入り順番に自動保存。ダウンロード一覧（進捗・一時停止・キャンセル・待機取り消し・最近の結果と再試行）とヘッダーの進捗チップ。Synology Secure SignInを開くボタンをTailscaleの隣に追加。|ソース/CHECKLIST_DEVICE_0.9.1.md/tests/downloads-0.9.1.cjs|
|0.9.0-claude|65|Claude版として別アプリ化（パッケージ・表示名・署名鍵・ファイル提供元を分離）。本棚の操作部を「種類チップ／表示切替／並べ替え・絞り込みシート」に整理、本の詳細を主ボタン＋アイコンタイルに、設定を4つのショートカット＋5つの折りたたみグループに再構成。|ソース/CHECKLIST_DEVICE_0.9.0.md/tests/ui-layout-0.9.0.cjs|
|0.8.6|64|本棚のリスト表示、9種並べ替え・昇降順・読みかけ固定・設定保持。72件単位の描画。|ソース/最新チェックリスト|
|0.8.5|63|NAS自動再接続・Tailscale起動案内・2FA待ち、小説の縦書き。|ソース/チェックリスト|
|0.8.4|62|ユーザー提供ShueiTimesの内蔵・フォント選択。|ソース/チェックリスト|
|0.8.3|61|読書のシークバーと文字フォント選択。|ソース/チェックリスト|
|0.8.2|60|SVG等の画像EPUB、CBZ/CBR、コミック読書操作。|ソース/チェックリスト|
|0.8.1|59|NASスキャン対象変更時に範囲外の表示を整理し保存済み本を保持。|ソース/チェックリスト|
|0.8.0|58|大量本の起動・分割描画、朗読追従/強調、保存済み音声Cast。|ソース/チェックリスト|
|0.7.0|57|現在ページから朗読、リッチウィジェット、TV/Android Autoの初期対応。|ソース/チェックリスト|
|0.6.2|56|戻る動作、表示件数/状態絞込、密度/シリーズ移動等。|ソース/チェックリスト|
|0.6.1|55|フォルダ内を折返しグリッド表示。|ソース/チェックリスト|
|0.6.0|54|読書中一覧拡張、ウィジェット、NAS自動同期、保存ファイル診断拡張。|ソース/チェックリスト|
|0.5.5|53|内部/SDのアプリ専用保存先選択。|ソース/チェックリスト|
|0.5.4|52|NAS音声ストリーム、独立DLと同時再生。|ソース/チェックリスト|
|0.5.3|未確認|大容量音声対策としてLibVLC導入。|後続ソース/チェックリスト。元0.5.3 ZIPは構造破損あり、回収記録参照|
|0.5.2|50|音声互換解析/コピーと診断。利用者レポートではCOMPAT_NO_AUDIO失敗。|ソース/利用者JSON|
|0.5.1|49|セルフテスト、同名形式グループ、M4B章一覧、添付PDF、メモ/共有。|ソース/チェックリスト|
|0.5.0|48|リーダー操作とメタデータ/手動同期、PC helper 0.3.0世代。|ソース/チェックリスト|
|0.4.9|47|EPUBページ位置・表示と操作UI改善。|ソース/チェックリスト|
|0.4.8|46|音声/TTSのミニプレイヤー・OSメディア操作。|ソース/チェックリスト|
|0.4.7|未確認|バックグラウンドDL世代。|ROADMAP/累積README。単独ソース未回収|
|0.4.6|未確認|ページ送り/朗読の初期実装世代。|ROADMAP/累積README。単独ソース未回収|
|0.4.5|未確認|この版のAPKの存在は確認。厳密な変更点の切分けは未確認。|artifact-inventory|
|0.4.4|未確認|再開ウィジェット世代。|ROADMAP/累積README。単独ソース未回収|
|0.4.3|未確認|この版のAPKの存在は確認。厳密な変更点の切分けは未確認。|artifact-inventory|
|0.4.2|未確認|PCサムネイルキャッシュ連携世代。|ROADMAP/累積README。単独ソース未回収|
|0.4.1|未確認|この版のAPKの存在は確認。木目棚等のUI改良期。正確な差分は未確認。|artifact-inventory/会話|
|0.4.0|未確認|木目棚・音声ジャケット等のUI改良期。厳密な版境界は未確認。|artifact-inventory/会話|
|0.3.7|未確認|会話/資料に言及あり。今回の一覧では該当成果物を確認できず。|会話/ROADMAP|
|0.3.0–0.3.6|未確認|アプリ内閲覧、ログイン保持、版表示、EPUB解析/画像ズーム・表示改善の初期。各パッチの厳密な対応は未確認。|各APKのメタデータ/会話|
|0.2.1–0.2.9|未確認|NAS接続・スキャン・取得の改良期。各パッチの厳密な変更点は未確認。|各APKのメタデータ/会話|
|0.2.0|20|DSM File StationによるNAS一覧取得の初期版。回収READMEでは閲覧/DL前の段階。|回収ソース/README|
|0.1.0|未確認|初期画面プロトタイプ。|HTML/APKメタデータ|

## PCツールと試作

- thumbnail-helper 0.1：CLIサムネイル生成。
- thumbnail-helper GUI 0.2：GUI/Windows導入・インストーラー作成用構成。
- PC-helper 0.3.0：ID、JSON/Markdownメタデータ、改名照合等。現行ソースに同内容を収録。
- 初期HTMLと木目本棚モックアップをhistorical-sourcesに保存。

全74成果物のメタデータ一覧は `docs/reference/artifact-inventory.json`。同じ版に複数の名称/記録があっても同一バイナリとは断定しない。古いAPKは最新版以外同梱せず、存在記録だけ残す。

## 今回の引き継ぎ作業

2026-10-15：ソースの機能改変なし。現状資料、要望対応表、GitHub用設定、軽量CI、過去スナップショット、整合性検査を追加。READMEを整理し元の累積READMEを保存。提供フォントとAPKをGit管理対象外に分離。アプリ版は上げていない。
