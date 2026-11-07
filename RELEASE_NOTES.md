# Theta Book Hatch リリースノート（Android。`release.yml` が `## <版>` の節を Release の本文にする）

## 1.1.0

**Theta Book Hatch**（旧 DSBooks）の最初の版です。DSBooks Claude とは別のアプリ（`app.thetahatch.book`、Theta Hatch シリーズ共通の鍵）なので、上書きではなく新しく入ります。

- **前の DSBooks から読み込む**：Theta Home Hatch の「移行」で、DSBooks（橋渡し版 1.0.1）から本棚・読書位置・栞とメモ・設定・NAS の接続先を引き継ぎます。Home が無い時は、DSBooks の 設定 →「新しいアプリへ移る」で書き出したファイルを、こちらの 設定 →「前の DSBooks から読み込む」で選びます。NAS のパスワードは入れ直してください。端末に保存していた本は、開く時に NAS から取り直します（読書位置はそのまま）。
- **更新**は Theta Home Hatch／KidsHome Hatch が行います（設定 →「更新を確認」。どちらも無ければ Releases ページを開きます）。
- 内容は DSBooks 1.0.0 と同じです（全画面の読書、見開き・縦スクロール・幅に合わせる、.jisui、FullOCR のページ対応とダイジェスト）。
- 秀英体フォントは入っていません（公開の配布物のため）。

## 1.0.1

DSBooks Claude の**橋渡し版**（`jp.shinwakai.dsbooks.claude`、これまでと同じ鍵）。DSBooks 1.0.0 の上に上書きできます。

- Theta Home Hatch の「移行」から呼ばれると、本棚・読書位置・栞とメモ・設定・NAS の接続先とアカウント名を 1 つのファイルに書き出して Home に渡します（`app.thetahatch.action.EXPORT`）。パスワード・API キー・本のファイルは入れません。
- Home が無い時は、設定 →「新しいアプリへ移る（書き出す）」でファイルに保存できます。
