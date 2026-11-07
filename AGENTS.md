# DSBooksを引き継ぐAI・開発者へ

このリポジトリは2026-10-15時点の0.8.6-preview（ChatGPT版）を引き継ぎ、0.9.0からClaude版として開発している。

1. まず `docs/AI_HANDOFF.md`、`docs/CURRENT_STATE.md`、`docs/BACKLOG.md` を読む。利用者の新しい明示指示があれば、それを優先する。
2. 作業前に実ファイルとテストを確認する。古いREADME／ROADMAPの途中に残る「未実装」を現在の状態と誤解しない。
3. 原本の本・NASフォルダを勝手に改名／削除しない。Calibre管理へ戻さない。常駐NASサーバーを必須にしない。
4. **Theta Hatch シリーズに参加（2026-11-07）**。Android の現行は `app.thetahatch.book`（Theta Book Hatch、1.1.0、versionCode 77）。署名は**シリーズ共通の鍵**で、GitHub Actions の `release.yml` が Secret（`ANDROID_KEYSTORE_B64`・`ANDROID_KEYSTORE_PASSWORD`・`ANDROID_KEY_ALIAS`・`ANDROID_KEY_PASSWORD`）で署名する（タグ `v<版>` を push）。次の更新は versionCode 77 より大きくする。別名やパスワードをファイルに書かない。旧 Claude 版 `jp.shinwakai.dsbooks.claude` は移行の橋渡し版（1.0.1、versionCode 76、Claude 版の鍵 alias `dsbooks-claude`）で終わり。以後この鍵は橋渡し版の作り直しにだけ使う。どの鍵もパスワードもコミットしない。ChatGPT 版 `jp.shinwakai.dsbooks.preview` と旧鍵は別アプリとして扱う。Java の名前空間は `jp.shinwakai.dsbooks.preview` のまま（build.sh が包装時にアプリ ID を変える）。公開リポジトリなので、利用者の秀英体フォントを Release に入れない
5. 現行のアプリコードは純粋なHTML/CSS/JavaScriptとJava。React/Capacitor/Gradleプロジェクトだと仮定しない。スクリプトの読み込み順と関数ラップを尊重する。
6. 蔵書・保存先トークン・bookId・読書位置・栞・メモを保持する。通信失敗時に前回のカタログを空にしない。
7. 木目の本棚は木目のまま。黒／濃緑にするのはヘッダー・フッター等。フォルダのホーム横棚とフォルダ内折り返し表示を区別する。
8. 大容量の本を丸ごとメモリへ読み込まない。カタログの表示上限は登録上限ではない。検索は全件を対象にする。
9. 問題に対応したテストを実行し、何を模擬し何を実機で未確認かを書く。過去の実機チェックを勝手に完了扱いにしない。
10. EPUB本文、NASアドレス、SID、パスワードを診断レポートへ入れない。本文データを外部AIへ自動送信しない（0.9.6のGemini要約は、利用者が送信内容を確認してボタンを押した時だけ、利用者のキーで送る。`docs/THETA_DIGEST.md`）。
11. 実装時は変更履歴・ロードマップ・実機チェックリストを更新。ビルドできた場合もZIP CRC、APK内アセット、署名、versionCode、配布物のハッシュを検証してからリンクを渡す。
12. 秘密鍵やSDKが見当たらない時は、既存の安全な保管先とビルド手順を確認する。「過去と同じAPKが作れない」と即断しない。ただし存在しないファイルや成功したビルドを捏造しない。
13. APK（およびPC版インストーラー）をリリースしたら、検証後にチャット内へ**APKの直接ダウンロードリンク**（`https://github.com/kiwiman0706-beep/Theta.Book.Hatch/releases/download/<tag>/<ファイル名>`）とリリースページのリンクを必ず表示する（利用者の指示、2026-10-17）。

Windows版は `desktop/`（Python＋pywebview、`desktop/README.md`）。共通画面を変える時はAndroid版とデスクトップ版の両方のテスト（`tests/desktop-0.1.0.cjs`）を回す。

最初の読解入口：`docs/NEXT_AI_PROMPT.md`。資料とコードが食い違う場合は、コード・テスト・実機報告を照合し、不確実な点として記録する。
