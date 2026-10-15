# DSBooks

Synology NAS上のフォルダをそのまま本棚として扱う、個人用Android読書・オーディオブックアプリです。EPUB、PDF、CBZ/CBR、Markdown、M4A/M4Bを扱います。NASにはDSM File Station APIで接続し、遠隔利用はTailscaleを前提にしています。

現在は **Claude版 0.9.1-claude / versionCode 66**（`jp.shinwakai.dsbooks.claude`、ChatGPT版0.8.6とは別署名・別アプリ）。Android本体とPC用キャッシュ／メタデータ生成ツールのソースを含みます。Windows/Mac用の読書クライアントやiOS版の完成品ではありません。

## はじめに読むもの

- [AI向け引き継ぎ](docs/AI_HANDOFF.md)／[AIに渡す依頼文](docs/NEXT_AI_PROMPT.md)
- [現在の実装と制限](docs/CURRENT_STATE.md)／[全要望の対応表](docs/REQUIREMENTS.md)
- [開発の経緯](docs/DEVELOPMENT_HISTORY.md)／[バージョン履歴](CHANGELOG.md)
- [今後の課題](docs/BACKLOG.md)／[既知問題](docs/KNOWN_ISSUES.md)
- [構成とコード案内](docs/ARCHITECTURE.md)／[データ形式](docs/DATA_AND_SYNC.md)
- [ビルド・署名・配布](docs/BUILD_AND_RELEASE.md)／[テスト](docs/TESTING.md)
- [GitHubへの移行](docs/GITHUB_IMPORT.md)／[収録範囲と欠落](docs/SCOPE_AND_GAPS.md)

## 開発

既存のビルド方式はGradleではなく `build.sh` です。Linux/WSL環境、JDK 17以上、Python 3、Android SDK platform 35 / build-tools 35.0.0、別途保管した従来の署名鍵が必要です。依存物はURL・SHA-256を固定して取得します。

```sh
export ANDROID_HOME=/path/to/android-sdk
# Claude版の鍵を build/dsbooks-claude.keystore に安全に配置する（docs/BUILD_AND_RELEASE.md）
bash build.sh
```

鍵パスワードは対話入力できます。既存ユーザーへの上書き更新には同じ鍵とパッケージIDが必要です。新しい鍵を勝手に作って更新用APKと称さないでください。

PC用GUIは `thumbnail-helper-release/`、共通CLIは `tools/`。Windows用Setup.exe生成手順はありますが、ビルド済みインストーラーはこの一式に含まれません。

## 検証と取り扱い

Android実機・実NAS・Cast/Auto/TVの未確認事項は各 `CHECKLIST_DEVICE_*.md` に分離しています。チェック済みと推測を混ぜないでください。全テストの過去結果は `notes/`、今回の梱包確認は `docs/HANDOFF_VALIDATION.md`。

秘密鍵・ユーザーデータ・購入書籍はGit管理しません。提供フォントは別保管にしており、復元方法はビルド文書を参照。ソースには従来の個人向け表示名や接続先初期値が残っているため、最初は非公開リポジトリで扱ってください。公開前の確認事項と第三者ライセンスは [取り扱い文書](docs/SECURITY_AND_LICENSES.md) にあります。

旧READMEの累積記録は [履歴資料](docs/history/README-accumulated-through-0.8.6.md) としてそのまま保存しています。現行仕様として使わないでください。
