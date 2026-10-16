# テストの使い分け

## 実装済みと実機確認済みを分ける

`CHECKLIST_DEVICE_*.md` はユーザーが後から実機で確認する項目。`notes/` はその版を作ったときの記録で、今回の全項目再実行結果ではない。今回の実行結果は `HANDOFF_VALIDATION.md` のみを参照。

セルフテストはカタログ/保存/解析/一部位置や深いファイル演習を検査する。スピーカーから正しい音が出る、Bluetoothや通知で操作できる、画面が見やすい、実NAS認証が通る、といった事実を機械検査だけから認定しない。

## 既知の不安定なテスト

`tests/bundled-font-0.8.4.cjs` は固定の待ち時間（300ms）でフォント読み込みを待つため、コンテナ起動直後など負荷が高いと失敗することがある（0.9.2作業時に起動直後2回失敗、その後は変更あり／なしとも6/6成功）。失敗時は再実行し、続けて失敗する場合だけ原因を調べる。

## 依存の少ない検査

```sh
node tests/model.cjs
python3 -m pip install -r requirements-dev.txt
python3 -m unittest discover -s tests -p 'test_metadata.py'
```

モデルテストは同期・整理の不変条件、PythonテストはID、改名/コピー、Markdownメタデータ保持等を確認する。`scripts/check_handoff.py` は配布資料/ソースの構造確認用で、アプリの実機テストではない。

## ブラウザ回帰

Playwrightを使う `.cjs` テストを収録。環境に応じて `PLAYWRIGHT_MODULE` や `NODE_PATH` を使う旧テストと、直接 `require('playwright')` するものがある。各ファイル冒頭を読む。Chromium実行ファイルは多くのテストで `TEST_CHROMIUM` 指定可能。

```sh
npm install
npx playwright install chromium
node tests/library-list-0.8.6.cjs
node tests/navigation-0.6.2.cjs
node tests/startup-0.8.0.cjs
node tests/release-0.8.5.cjs
```

環境に合わせて `TEST_CHROMIUM=/absolute/path/to/chromium` を指定する。古いテストは現行UIに対して前提が古くなっている可能性があり、失敗の理由を区別する。Android bridgeやNASをモックしたブラウザ成功を実機成功に読み替えない。外部フォント復元が必要なテストがある。

## ネイティブ/形式検査

`tests/*Test.java` はEpubInspection、BookLocation、CastFileServer、IsoChapterParser、NasAudioSource、ComicContent、AudioCompatibility、SpeechCursorを対象にしたハーネス。個別に必要な本体Javaと依存を指定する。Android Service全体のテストではない。既存の `notes/` 記録に実行手順があるものを優先し、SDK不要の純Java検査とAndroid依存の検査を混同しない。

`tests/fixtures/`, `tests/audio-fixtures/` は機械検査用の小さな素材。利用者の購入書籍・問題の大容量M4Bは同梱していない。

## 優先する実機確認

1. 既存0.8.xから同じ鍵で上書きし、保存済み本/位置/認証が残る。
2. 最新0.8.6リストの切替、9種類のソート、昇降順、読みかけ固定、絞り込み、戻る、大量本。
3. 問題の大容量M4BをローカルとNASで再生・シーク・消灯・再開。診断も採取。
4. 小説EPUBの横書き/縦書き、フォント、ページ先頭からの朗読、追従/強調、回転後位置。
5. 2端末同期、NAS切断、Tailscale復帰、2FA要求、フォルダ改名、SD取り外し。
6. Cast、Android TV/Auto、サムネウィジェットは実機とOS/ランチャーを記録して別途検証。

レポートには版、端末/OS、再現手順、期待/実際、セルフテストJSONを添える。SID/パスワードを含めない。
