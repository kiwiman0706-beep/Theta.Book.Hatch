# FullOCR に Theta.Jisui.Viewer を同梱する（FullOCR 開発向け）

Theta.Jisui.Viewer は、DSBooks（Theta.Book.Hatch）の PC/Mac 版を NAS 機能なしで動かすビューアです。`.jisui`（jisui-1）をダブルクリックで開けます。秀英体フォントは入っていません（同梱しても配布上の問題がありません）。

## 取得
GitHub Release `jisui-viewer-v<版>`（リポジトリ kiwiman0706-beep/dsbooks、非公開）の成果物は次のとおりです。

- Windows：`ThetaJisuiViewer-Setup-<版>.exe`（`.jisui` を関連付けるインストーラー）、`ThetaJisuiViewer-<版>-windows-portable.zip`
- macOS（Apple Silicon）：`ThetaJisuiViewer-<版>-macOS-arm64.dmg` と `.zip`。中身は `Theta.Jisui.Viewer.app` で、`com.theta.jisui` を開ける
- `SHA256SUMS.txt`
- Android：Release `v<版>-jisui-viewer-android` の `ThetaJisuiViewer-<版>.apk`（`com.theta.jisuiviewer`）。ファイルアプリで `.jisui` を「アプリで開く」と、取り込んで開く。Android では PDF を `.jisui` に同梱する形式（`embedded`）を推奨する

FullOCR のビルドでこれをダウンロードし、ハッシュを照合して同梱してください。ソースを取り込む必要はありません。

## インストール・関連付け
- Windows：
  - FullOCR のインストーラーから `ThetaJisuiViewer-Setup-<版>.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART` を実行します。
  - ユーザー単位で `%LOCALAPPDATA%\Programs\ThetaJisuiViewer` に入り、`.jisui` が関連付けられます。管理者権限は不要です。
- macOS：`Theta.Jisui.Viewer.app` を `/Applications` に置けば、Finder がドキュメント型を登録します。未公証のため、初回は「このまま開く」が必要です。

## FullOCR から開く
- Windows：`"%LOCALAPPDATA%\Programs\ThetaJisuiViewer\ThetaJisuiViewer.exe" "<path>.jisui"`
- macOS：`open -a "Theta.Jisui.Viewer" "<path>.jisui"`
- 起動済みなら、2つ目のプロセスがファイルを渡してすぐ終了します（ポート 47818 の `/open`）。
- 起動確認は `GET http://127.0.0.1:47818/ping` → `{"app":"jisuiviewer"}`。

## 約束事
- ビューアは `.jisui` を書き換えません。
- `pdf.mode=sidecar` の PDF は `.jisui` と同じフォルダの `pdf.sidecar` を探します。移動する時は一緒に動かしてください。
- データ（読書位置・メモ）は `%LOCALAPPDATA%\Theta\JisuiViewer` または `~/Library/Application Support/Theta/JisuiViewer` に置きます。
