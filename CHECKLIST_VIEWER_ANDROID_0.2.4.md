# Theta.Jisui.Viewer for Android 0.2.4 実機チェックリスト

ビルド時に確認済み：
- パッケージ `com.theta.jisuiviewer`、表示名 Theta.Jisui.Viewer、versionCode 74
- 秀英体がAPKに入っていないこと
- ウィジェット・Android Auto がないこと
- `.jisui` の「アプリで開く」用フィルターがあること
- アセットがソースと一致すること
- DSBooks Claude と同じ署名証明書であること

画面の動き（ビューアモード）は `tests/jisui-0.9.7.cjs` で模擬して確認済み。以下は **実機で未確認**。

|ID|確認|結果|
|---|---|---|
|A01|DSBooks Claude と並べてインストールできる（別アプリとして共存）||
|A02|起動すると「自炊本」の画面で、NAS・Tailscale・同期・ダウンロードが出ない||
|A03|ファイルアプリで `.jisui` →「アプリで開く」→ Theta.Jisui.Viewer で開ける||
|A04|章リンク・挿絵・「原文 p.N」（PDF同梱）・PDF→本文・ダイジェスト||
|A05|読み上げ、ピンチ拡大（指の位置が中心）、文字フォントに秀英体が出ない||
|A06|「📂 ファイルを開く」で端末の `.jisui` を選んで開ける||
