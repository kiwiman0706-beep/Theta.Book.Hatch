# DeskHatch からの DSBooks 起動（プラグイン連携）

DSBooks for Windows 0.2.0 以降が DeskHatch 側に提供する約束事と、DeskHatch 開発への依頼文。DSBooks 側はこの約束事を変えない（変える時は互換を残す）。

## DSBooks が提供するもの（0.2.0〜）

|項目|内容|
|---|---|
|本棚のURL|`http://127.0.0.1:47817/`（127.0.0.1のみ、ポート固定）。幅360px程度から崩れない|
|起動確認|`GET http://127.0.0.1:47817/ping` → `{"app":"dsbooks"}`（認証不要）|
|本棚ウインドウを前面に|`GET http://127.0.0.1:47817/show`（認証不要、副作用は表示のみ）|
|実行ファイル|既定 `%LOCALAPPDATA%\Programs\DSBooks\DSBooks.exe`（ユーザー単位インストール）|
|起動引数|`--background`：本棚を表示せず待機（ドロワー用）／引数なし：本棚を表示／`--library-tools`：表紙キャッシュ作成ツール|
|二重起動|起動済みなら新しいプロセスはすぐ終了し、既存の本棚を前面に出す|
|本を開く|ドロワー内で本を選ぶと、DSBooks がネイティブの別ウインドウで開く（ドロワー側の対応不要）|
|保存|本棚・読書位置・設定は DSBooks 本体が保持。ドロワーの webview の保存領域（partition）が別でも同じ本棚が見える|
|Mac|未提供（DeskHatch では Windows のみ表示でよい）|

---

## 概要（DeskHatch開発スレ向け）

DSBooks（NASの本棚・読書アプリ）の Windows 版が、ローカルの `http://127.0.0.1:47817/` で本棚画面を出せるようになった。DeskHatch の「ページ」型ドロワーにこのURLを入れれば今でも表示できる。ただし、DSBooks を先に起動しておく必要があり、追加も手作業になる。

そこで DeskHatch 側に「ローカルアプリ連携（プラグイン）」として DSBooks を組み込み、ボタン1つで、DSBooks が起動していなくても本棚の引き出しが開くようにしたい。本はドロワーの中ではなく、DSBooks が別ウインドウで開く。

## 依頼プロンプト

```
DeskHatch に「ローカルアプリをドロワーとして組み込む」仕組みを追加し、最初の対応アプリとして DSBooks（NAS本棚・読書アプリの Windows 版）を入れてください。

## DSBooks 側の約束事（DSBooks for Windows 0.2.0 以降、変更なしで使える）
- 本棚のURL: http://127.0.0.1:47817/ （127.0.0.1 のみ・ポート固定・幅360px程度から表示可）
- 起動確認: GET http://127.0.0.1:47817/ping → {"app":"dsbooks"}（認証不要）
- 本棚ウインドウを前面に: GET http://127.0.0.1:47817/show
- 実行ファイル: 既定 %LOCALAPPDATA%\Programs\DSBooks\DSBooks.exe
- 起動引数: --background（本棚を出さずに待機・ドロワー用）、--library-tools（表紙キャッシュ作成ツール）
- 二重起動しても安全（既に動いていれば新プロセスはすぐ終了し、本棚を前面に出すだけ）
- ドロワー内で本を選ぶと DSBooks がネイティブの別ウインドウで本を開く。DeskHatch 側の対応は不要
- 本棚・読書位置は DSBooks 本体が保持するので、webview の partition は DeskHatch 専用のもので構わない
- Mac 版 DSBooks はまだ無い

## やってほしいこと
1. 「ローカルアプリ」型のドロワー定義を追加する（汎用にして、後で他のローカルアプリも足せる形に）。
   例: { id:'dsbooks', label:'本棚', icon:'📚', type:'localapp', url:'http://127.0.0.1:47817/', health:'/ping', expect:{app:'dsbooks'},
         launch:{ win:{ exe:'%LOCALAPPDATA%\\Programs\\DSBooks\\DSBooks.exe', args:['--background'] } }, width:520, platforms:['win32'] }
2. ドロワーを開いた時の動き:
   - health を確認し、動いていれば URL を webview に表示。
   - 動いていなければ exe を引数付きで起動（detached・ウインドウなし・DeskHatch 終了時も止めない）し、「本棚を起動しています…」を表示しながら health を最大15秒ほどポーリングしてから表示。
   - exe が見つからない場合は「DSBooks for Windows が見つかりません」と、パスを指定するボタン・ダウンロード案内を表示（パスは設定に保存）。
   - 起動に失敗、またはタイムアウトした時は「再試行」ボタン。
3. ボタンの右クリックメニューに追加:
   - 「本棚ウインドウを開く」→ GET /show（未起動なら exe を引数なしで起動）
   - 「表紙キャッシュ作成ツール」→ exe を --library-tools で起動
4. 設定の「新規項目を追加」でプリセットとして「📚 DSBooks 本棚」を選べるようにする（既定のボタン一覧には自動では入れなくてよい）。
5. webview の partition は 'persist:localapp-dsbooks' のように専用にする（Google ログイン用の UA 書き換えは不要）。外部へのナビゲーションはしない前提だが、127.0.0.1:47817 以外への遷移は標準ブラウザで開く。
6. ドロワーを閉じても DSBooks は止めない。DeskHatch 終了時も止めない。
7. Mac ではこの項目を出さない（または「Windows のみ」と表示）。

## 確認
- DSBooks 未起動 → ボタン → 自動起動して本棚が表示される
- DSBooks 起動済み → ボタン → すぐ表示される
- 本をクリック → DSBooks の別ウインドウで開く（ドロワー内に読書画面が出ない）
- 右クリック → 本棚ウインドウ／表紙キャッシュ作成ツールが開く
- DSBooks 未インストール → 案内が出て、パス指定で動く
- ユニットテスト（health 判定・起動・タイムアウト・exe 不在）と、可能なら e2e で /ping を返すスタブサーバーを使った表示確認
```
