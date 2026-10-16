DSBooks用の**表紙キャッシュ・メタデータ作成ツール**（PC用）です。NASの蔵書フォルダから表紙の縮小画像と索引（catalog.json）、Obsidian互換のメタデータを作り、Android版DSBooksの本棚に表紙・シリーズ・タグを反映します。元の本は読み取るだけで変更しません。外部への通信もしません。

## どれを使うか

| ファイル | 対象 | 使い方 |
|---|---|---|
| `DSBooks-Thumbnail-Helper-Setup-*.exe` | Windows | ダブルクリックでインストール。スタートメニューの「DSBooks 表紙キャッシュ」から起動 |
| `DSBooks-Thumbnail-Helper-*-macOS-arm64.zip` | Mac（Apple シリコン） | 展開して「DSBooks Thumbnail Helper」をアプリケーションへ。初回は右クリック→「開く」 |
| `DSBooks-Thumbnail-Helper-*-portable.zip` | Windows（Python導入済み） | 展開して `setup.bat`。Pythonで直接動く従来版 |

署名していないため、初回はWindowsで「WindowsによってPCが保護されました」→「詳細情報」→「実行」、Macでは右クリック→「開く」が必要です。

## 使い方

1. 「フォルダを選択」で、PCから見えるNASの蔵書フォルダを選ぶ（例：`Z:\8Books\⑧カメラ`、Macは `/Volumes/8Books/⑧カメラ`）。
2. 同じ場所のDSMパスを入れる（例：`/8Books/⑧カメラ`）。
3. 「表紙キャッシュを作成」。完了後、DSBooksでNASを同期。
4. シリーズ・巻数・タグは「メタデータを開く」のMarkdownで編集して再作成。Android版の「設定 → 同期とバックアップ → 読書データ／PC索引を取り込む」で `_DSBooksCache/catalog.json` を読み込むと反映されます。

## 0.3.1（Claude版での最初の配布）

- Windowsインストーラー（.exe）とMac版アプリを初めて配布。
- Mac：日本語フォント（ヒラギノ）と設定の保存先（~/Library/Application Support）に対応。
- 画面にバージョンを表示。処理内容は0.3.0と同じ（PDF先頭ページ・EPUB埋め込み表紙・M4A/M4B埋め込み画像、2回目以降は変更分だけ）。

自動確認：Windows/Macのビルド環境で、生成したPDFから表紙と索引が作られることを確認。実機での画面操作・インストール・NAS上での実行は未確認です。
