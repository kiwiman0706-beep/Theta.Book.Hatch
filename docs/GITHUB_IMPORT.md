# GitHubへの移行

`repository/` の中身をリポジトリのルートにする。外側のAPK・私用フォント・過去ZIPをまとめてGitに入れない。現時点ではGitHubへの作成/公開/pushは実行していない。

```sh
cd repository
git init -b main
git status --short
# SECURITY_AND_LICENSES.md に沿って内容を確認した後
git add .
git commit -m "Import DSBooks 0.8.6 source and development handoff"
# GitHub側で非公開リポジトリを作り、実際のURLを設定
# git remote add origin <実際のリポジトリURL>
# git push -u origin main
```

- 過去の本物のcommit graphを回収したわけではない。過去の日付を偽装したコミット履歴を生成しない。
- 現行コード、CHANGELOG、履歴資料、スナップショットの由来を残す。
- `.gitignore` は鍵/書籍/フォント原本/build依存/APKを除外する。既に追跡済みのファイルにはignoreは効かないため、公開前に `git ls-files` も確認する。
- 個人向けの画面表示名と接続先初期値が現行ソースに残る。最初はprivateで管理し、公開時に汎用設定へ置き換える。
- APKは通常Gitの100MB制限を超えるのでコミット対象にしない。配布する場合は適切なRelease等の添付を利用し、秘密鍵や購入フォントの再配布条件を確認する。
- `.github/workflows/ci.yml` は軽量モデル/メタデータ検査用。Android署名ビルドや実機テストを実行する設定ではない。GitHub上では未実行。

`historical-sources/` は整理済みの参考履歴として別保管するか、必要な版だけ作業用ディレクトリへ展開して比較する。現行ディレクトリに上書き展開しない。
