# DSBooks 0.8.0 自動検証記録

Android実機・Cast受信機はこの環境にありません。以下のPASSは記載した検査範囲です。

| 項目 | 方法・結果 |
|---|---|
| 大量蔵書の起動 | Chromium + Playwright、12,000冊・100フォルダ。初回描画1回、96カード、読書中24冊。起動時のhasBook/remoteThumbnailPath同期呼び出し0件。後方検索、0件検索、フォルダ72+48冊、ホームへ戻るをPASS。 |
| 読書画面回帰 | ui-smoke.cjs：シリーズ、栞、ページ送り、再開、テーマ、検索、回転、設定をPASS。 |
| ナビゲーション回帰 | navigation-0.6.2.cjs：小画面→本→フォルダ→ホームの戻る、絞り込み、実冊数、表紙密度、設定保持、1/2/10巻の順序、棚スクロール復帰をPASS。 |
| 表示ページからの朗読 | device-0.7.0.cjs：72頁目の可視文字から開始、長文ノード、一時停止、ページ変更、回転、画像ページ、車側位置統合、ウィジェット要求、TVキー操作をPASS。 |
| 朗読追従 | speech-follow-0.8.0.cjs：通知範囲→自動ページ送り、強調テキスト照合、DOM本文不変、ルビ重複除外、手動追従停止・復帰、文単位通知、回転、同セッション再読込をPASS。 |
| 発話管理 | SpeechCursorTest.java：UTF-16オフセット、停止済み発話のコールバック無視、再開、終了、サロゲート境界をPASS。 |
| Cast配信HTTP | CastFileServerTest.java：GET/HEAD、部分・末尾Range、不正／複数／範囲外Range、別URL拒否、メソッド制限、3GB sparseファイルのオフセット、停止後接続拒否をPASS。実音声デコードではない。 |
| Cast画面連携 | cast-ui-0.8.0.cjs：選択ファイルと開始位置を渡す、NAS認証を渡さない、通知状態の模擬受信、ミニプレイヤー、一時停止、42秒から端末へ戻すをPASS。機器検出・通信・スピーカー出力は未検証。 |
| 既存NASストリーミング回帰 | streaming-0.5.4.cjs：再生と保存の並行操作、保存の独立停止、章一覧、ミニプレイヤー復帰、進捗保持、ローカル切替、認証情報の非保存をPASS。実NAS通信ではない。 |

実機側で確認する項目は CHECKLIST_DEVICE_0.8.0.md に分離。合成12,000冊での起動時間は開発環境の参考値で、スマートフォンの所要時間を保証しない。元EPUB／M4B実ファイル全件の見た目・音声、Bluetooth、消灯継続、SD抜き差し、NAS同期、Cast実機は未検証。

## APK検証

- Android platform 35 / build-tools 35.0.0、Java→D8→APK作成成功。Castを含む59依存をハッシュ検証。
- versionName 0.8.0-preview、versionCode 58、minSdk 26、targetSdk 34。
- v2/v3署名検証成功。証明書SHA-256は既存版と同じ `dc898a4794814c3670408e97aea3a614f883bd7568a3d40cc9856714f6c4fa06`。
- APK内の全assetsがビルド元ファイルとバイト一致。
- APK SHA-256: `fdd8293c202bcca0cdedb1490ac8e41c48c07ce795d3beb0170b9be19c56060a`。
- Google配布のCastクラスにEnclosingMethodに関するD8情報メッセージあり。コンパイル・署名検証は成功。Android実行時確認は別紙。
