# PC/Mac版の統合計画

利用者の方針（2026-10-16）：PC用の表紙キャッシュ作成ツールは、最終的にAndroid版と同等の**PC/Mac用ビューワーと1つのアプリに統合**する。以後のPCツールの変更はこの方向に沿って行う。

## 目標の形

1つのデスクトップアプリ「DSBooks（PC/Mac）」に、次の2つを入れる。

1. **本棚・ビューワー**：Android版と同じ本棚・読書・再生。NASに直接接続し、同じ読書位置・栞・メモを使う。
2. **ライブラリ管理**：現在の表紙キャッシュ作成・Obsidianメタデータ・catalog.json生成（`thumbnail-helper-release/` の機能）を、画面の1メニューにする。

## 推奨構成：Python＋pywebview

|部分|方法|理由|
|---|---|---|
|画面|Android版の `app/src/main/assets/`（HTML/CSS/JS）をそのまま pywebview で表示|画面を二重に作らない。Android版の改良がPC/Macにも入る|
|ネイティブ機能|`DSBooksNative` と同じ名前・引数のブリッジをPythonで実装（pywebviewの `js_api`）|画面側のJSは変更不要か最小限。`docs/reference/native-bridge.md` が仕様|
|NAS接続|Python（標準ライブラリ／requests）でDSM File Station API|Android版と同じAPI・同じパス|
|EPUB|`EpubContent.java` の処理をPythonへ移植（同じ出力JSON）|章HTML・画像・`imageOnly`・方向の判定を揃える|
|PDF・表紙|PyMuPDF（既存ツールで使用中）|ページ画像化と表紙生成を共通化|
|CBZ/CBR|zipfile／rarfile|Android版のJunrar相当|
|音声|画面の `<audio>`、必要ならpython-vlc|M4Bの章はmutagen（既存ツールで使用中）|
|表紙キャッシュ・メタデータ|既存の `dsbooks_thumbnails.py`／`dsbooks_metadata.py` をそのまま呼ぶ|今のツールの中核を再利用|
|配布|PyInstaller＋Inno Setup（Windows）、.app（Mac）|`.github/workflows/release-pc-helper.yml` と同じ流れ|

Electron/Tauriも候補だが、既存の中核がPythonで、PyMuPDF・mutagenをそのまま使えるため、Pythonにまとめるのが移行の手間が最も少ない。

## データの互換（必ず守る）

- 本の識別：`bookId`（PCツールのメタデータ）と、Android版のパス由来の照合。原本は改名しない。
- 読書データ：schema 1 の読書JSONと、NASの `_DSBooksSync` 端末別ファイル。PC/Macも1台の端末として参加する。
- キャッシュ：`_DSBooksCache/{catalog.json,thumbs,metadata}` の形式を変えない（変える時はschemaを上げ、旧形式も読む）。
- 認証情報は各端末のOSの安全な保管場所（Windows資格情報／macOSキーチェーン）。NASアドレス・SID・パスワードを診断へ入れない。

## 段階

1. **済（0.3.1）**：今のツールをWindowsインストーラー＋Mac版としてCIで配布できるようにした。
2. フォルダ構成を `desktop/`（アプリ本体）＋`desktop/core/`（今の表紙・メタデータ処理）に整理。今のGUIは「ライブラリ管理」画面として残す。
3. pywebviewで本棚を表示し、ローカルの本（端末フォルダ）でPDF・EPUB・CBZを読めるようにする。
4. NAS接続・ダウンロード・読書データ同期を追加し、Android版と位置を共有。
5. 音声・朗読（OSの読み上げ）・PC向け操作（キーボード、ウィンドウ幅）を追加。
6. 表紙キャッシュ作成を同じアプリのメニューに統合し、単独ツールの配布を終了。

各段階で、Android版と同じ実機チェックリスト方式（`CHECKLIST_DESKTOP_*.md`）を作り、画面確認はWindows・Mac実機で利用者が行う。
