# 今回の引き継ぎ検証

検証日：2026-10-15。基準0.8.6-preview。機能追加/新APKビルドは行わず、保存済み現行ソースとAPKを梱包した。

|検査|結果|範囲|
|---|---|---|
|元ソース全234ファイルのSHA-256照合|PASS|READMEは履歴へ、フォントはprivate-assetsへ移動した対応先を検証。他の元ファイルも全一致|
|`scripts/check_handoff.py --baseline`|PASS|構造・参照JSON・元ソース照合|
|`node tests/model.cjs`|PASS|新しい進捗、パス照合、メモ編集/削除/合流、schema、認証情報除外、作品グループ等|
|Python metadata unittest|PASS|2 tests。改名/コピー/IDとMarkdown保持等|
|現行APK ZIP CRC|PASS|1,297エントリを検査|
|APK/sourceのassets比較|PASS|フォントを含む30ファイルが全バイト一致|
|APK署名|PASS|apksignerでv2/v3、署名者1名、従来証明書と一致|
|APK版/SDK/ABI|PASS|package jp.shinwakai.dsbooks.preview、code64/name0.8.6-preview、min26/target34/compile35、4 ABI、12 so|
|APKサイズ/SHA-256|PASS|109,809,860 bytes。CURRENT_STATEの値と一致|
|過去ソース整理|PASS/一部回収|正常ZIPは全エントリをCRC確認。0.5.3のみ元ZIP破損、CRC確認済み部分を回収。詳細はsnapshots-indexと各HANDOFF_SNAPSHOT|
|秘密鍵・既知の旧直書き秘密文字列|PASS|現在ソースと入れ子の過去ZIPを検査、鍵を除外、旧秘密文字列を置換|
|新規文書のMarkdownリンク|PASS|作成した入口とdocs直下。旧資料の古い参照先は未修正|
|新規Pythonスクリプトの構文|PASS|AST解析|
|モデル/CI依存の整合|確認|ローカルPyYAML6.0.3。CIはGitHub上で未実行|

ブラウザ回帰は今回の梱包で再実行していない。元の `notes/AUTOTEST_0.8.6.md` に4本のブラウザ回帰PASS記録を保持した。実NAS・Android実機・Cast・Auto・TV・音声出力の新たな検証は今回実施していない。

最終ZIPは作成後に全エントリCRCとMANIFEST.sha256の値を比較する。展開後は外側の `verify_bundle.py` を使う。梱包用の整合性検査はアプリ動作保証ではない。

書籍原本/完全会話/初期各版のソース等の欠落はSCOPE_AND_GAPSを参照。秘密文字列検索は網羅的セキュリティ監査ではない。
