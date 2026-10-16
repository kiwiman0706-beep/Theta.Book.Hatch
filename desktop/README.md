# DSBooks for Windows（デスクトップ版）

Android版と同じ画面（`app/src/main/assets`）を pywebview（Windowsでは WebView2）で表示し、Androidの `DSBooksNative` ブリッジを Python で実装したもの。表紙キャッシュ作成ツール（`thumbnail-helper-release/`）は `--library-tools` で同じ exe から起動する。計画は `docs/DESKTOP_PLAN.md`。

|ファイル|役割|
|---|---|
|`dsbooks_desktop.py`|起動。ウィンドウ、固定ポート（47817、保存データのため変えない）、`--library-tools`、`--serve-only`|
|`server.py`|127.0.0.1 のみの HTTP。画面配信、`/bridge`（同期呼び出し）、`/events`（コールバック）、`/proxy`（NAS中継）、`/media`・`/nas-stream`（Range対応）。起動ごとのトークン必須|
|`bridge.py`|ブリッジ本体。保存先 `%LOCALAPPDATA%\DSBooks`、DPAPI、ダウンロード待ち行列、PDF/CBZ/表紙、ファイル選択|
|`epub_content.py`|`EpubContent.java` の移植。報告本21章で Java と完全一致を確認済み|
|`web/desktop-bridge.js`|画面側の `DSBooksNative`。音声（HTML audio）・朗読（speechSynthesis）はここで実装し、Android と同じ `onPlaybackState` 形式で通知|
|`DSBooks.iss`／`smoke_test.py`|インストーラー、CIの起動確認|

開発時：`pip install -r desktop/requirements.txt` → `python desktop/dsbooks_desktop.py`。テスト：`DESKTOP_PYTHON=<python> node tests/desktop-0.1.0.cjs`（模擬NAS付き）。配布：一時ブランチ `release-desktop/v<版>` を push すると `.github/workflows/release-desktop.yml` が Windows でビルド・確認・公開する。`bridge.py` の `APP_VERSION` を `<版>-desktop` に合わせる。
