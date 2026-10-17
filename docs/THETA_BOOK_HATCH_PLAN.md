# Theta.Book.Hatch 構想（DSBooks PC/Mac 版の改名と Theta.xxx.Hatch 対応）

2026-10-17 作成。DSBooks for Windows 0.2.0 を出発点に、DeskHatch ファミリーの一員「Theta.Book.Hatch」とする計画。**まだ構想段階で、改名の実装はしていない。**

照合した資料：DeskHatch リポジトリのブランチ `claude/determined-turing-rcpxpc`（`docs/LOCALAPP-PROTOCOL.md`、`.claude/skills/deskhatch-companion-app/SKILL.md`、コミット `7831c05` / `7db7f0a`）。このブランチは 2026-10-17 時点で DeskHatch の既定ブランチに入っておらず、localapp ドロワーは**まだ配布されていない**。そのため、DeskHatch 側のプリセットは互換を残さずに書き換えられる。

---

## 1. 名前の対応表

|項目|現在（DSBooks 0.2.0）|Theta.Book.Hatch（案）|
|---|---|---|
|製品名（表示）|DSBooks|**Theta.Book.Hatch**（短縮表示「Book Hatch」）|
|ウインドウタイトル|DSBooks|Book Hatch（本のウインドウは書名のみ）|
|発行元|DSBooks|**Theta Corp**（DeskHatch の `ThetaCorp.DeskHatch` に揃える）|
|実行ファイル|`DSBooks.exe`|`BookHatch.exe`（ドットや空白を入れない）|
|インストール先|`%LOCALAPPDATA%\Programs\DSBooks`|`%LOCALAPPDATA%\Programs\BookHatch`|
|インストーラー|`DSBooks-Setup-<ver>.exe`|`BookHatch-Setup-<ver>.exe`|
|winget ID|なし|`Theta.BookHatch`（`Theta.DeskHatch` と同じ形）|
|Mac アプリ|なし|`/Applications/Book Hatch.app`、実体 `Contents/MacOS/BookHatch`、Bundle ID `jp.theta.bookhatch`（案）|
|データフォルダ|`%LOCALAPPDATA%\DSBooks`／`~/Library/Application Support/DSBooks`|`%LOCALAPPDATA%\Theta\BookHatch`／`~/Library/Application Support/Theta/BookHatch`|
|`/ping` の app ID|`dsbooks`|`bookhatch`|
|DeskHatch プリセット ID|`dsbooks`|`bookhatch`（partition `persist:localapp-bookhatch`）|
|ポート|47817|**47817 のまま**（ページのオリジンを変えない）|
|配布タグ|`desktop-v0.x.x`|`bookhatch-v1.x.x`（案）|

### 変えないもの

- **Android 版のパッケージ ID `jp.shinwakai.dsbooks.claude`、署名鍵、versionCode の流れ。** ID や鍵を変えると別アプリ扱いになり、上書き更新できなくなる（AGENTS.md の規則4）。変えてよいのは**表示名だけ**で、例えば「Book Hatch」にできる。表示名も変えるかどうかは利用者が決める。
- ポート 47817。オリジン `http://127.0.0.1:47817` が変わると webview 側の保存が別物になるため。本棚データ自体は `storage.json` 側にあるので消えはしないが、無用な変化は避ける。
- `/bridge`・`/events`・`/proxy`・`/media`・`/nas-stream` の中身とトークン方式。
- 共通画面（Android アセット）。改名で画面文言の「DSBooks」を変えるなら、Android とデスクトップ両方のテストを回す。

---

## 2. Theta.xxx.Hatch の要件と現状

DeskHatch のコンパニオンアプリ契約に、ファミリーとして揃えたい項目（★）を足して照合した。

|#|要件|区分|DSBooks 0.2.0|Book Hatch でやること|
|---|---|---|---|---|
|1|127.0.0.1 のみで UI を配信、ポート固定|必須|✅ 47817|そのまま|
|2|幅 360px から崩れない|必須|✅ 実測済み（スモークテスト）|ドロワー幅 520 でも崩れないことを UI テストに追加|
|3|`GET /ping` が JSON を返し、認証なし・副作用なし|必須|✅ `{"app":"dsbooks"}`|`{"app":"bookhatch","product":"Theta.Book.Hatch","version":"1.0.0","family":"hatch","protocol":1}` にする|
|4|`--background`（画面を出さずに待機）|必須|✅ 隠しメインウインドウ|そのまま。ただし後述のトレイで終了できるようにする|
|5|二重起動に耐える|必須|✅ `/ping` 確認後に `/show` して終了|旧 `dsbooks` の応答も「同じアプリが動いている」とみなす（移行期間）|
|6|ドロワーや DeskHatch が終了しても生き続け、自分の寿命は自分で管理|前提|△ 常駐はするが、終了手段が ☰ メニューの「終了」だけ|**タスクトレイ（Mac はメニューバー）常駐**：本棚を開く／ライブラリ管理／データフォルダ／終了|
|7|webview に状態を持たない|前提|✅ `dsbooks.*` を `storage.json` に写している|そのまま|
|8|機微な API はトークン必須（`/ping` は除く）|前提|✅ 起動ごとのトークン|そのまま。`/show` は表示のみなので認証なし|
|9|`GET /show`（任意アクション）|任意|✅|★ `/show?view=downloads` などの表示先指定は任意で追加|
|10|重い画面は自前の別ウインドウ|任意|✅ 本ごとに別ウインドウ|そのまま|
|11|Mac の起動パス（`launch.darwin`）|DeskHatch|❌ Mac 版なし|**Mac 版を作る**（§4）|
|★12|発行元・命名の統一（Theta Corp、`Theta.<Name>Hatch`）|ファミリー|❌|§1 の対応表どおりに改名|
|★13|ポートの重複回避|ファミリー|―|ファミリーのポート表を DeskHatch 側の資料に置く（§5）|
|★14|自動更新／更新通知|ファミリー|❌|最初は GitHub Releases を見て「新しい版があります」と知らせるだけ。自動差し替えは後回し|
|★15|コード署名|ファミリー|❌（SmartScreen 警告あり）|Windows は当面未署名と明記。Mac は公証（notarize）なしだと Gatekeeper で開けないため、Developer ID が必要か要判断|
|★16|winget／ストアでの配布|ファミリー|❌|インストーラーが固まってから winget に `Theta.BookHatch` を出す|

---

## 3. 改名の移行手順（利用者のデータを失わない）

1. **データフォルダの引き継ぎ**：初回起動時に新フォルダが無く旧 `DSBooks` フォルダがあれば、**移動ではなくコピー**する。コピー対象は `storage.json`、保存済みの本、表紙キャッシュ、`credentials`、`download.log`。旧フォルダは消さない。DPAPI はユーザー単位の保護なので、同じ Windows ユーザーならコピー後も読める。コピーが終わったら印 `migrated-from-dsbooks.json` を置き、二度とコピーしない。
2. **インストール先**：新インストーラーは `BookHatch` に入れる。旧 `DSBooks` はアンインストールしないが、「旧 DSBooks をアンインストールしても本棚は残ります」と案内する。同時に動かすとポート 47817 を取り合う。新版の起動時に旧版が動いていた場合（`/ping` が `dsbooks` を返す）は、「旧 DSBooks が動いています。終了してから開いてください」と表示する。旧版には外部から終了させる窓口が無いので、終了の操作は利用者に頼む。
3. **スタートアップ**：旧版の `--background` ショートカット（`DSBooks（バックグラウンド）`）が残っていると、旧版が先にポートを取る。新インストーラーがこれを消す（`[InstallDelete]` で `{userstartup}\DSBooks（バックグラウンド）.lnk` を削除）。
4. **DeskHatch プリセット**：DeskHatch の localapp は未配布なので、配布前に `id:'bookhatch'`・`expect:{app:'bookhatch'}`・新しい exe パスへ差し替えてもらう（§6 の依頼文）。もし DeskHatch が先に `dsbooks` のプリセットで配布された場合は、Book Hatch 1.0 の間だけ `/ping` に `"app":"dsbooks"` を返し、`"product"` で見分ける形へ切り替える。
5. **Android**：変えない（§1）。PC と Android の間の読書位置同期は NAS 上のファイルを介すので、改名の影響は受けない。

---

## 4. Mac 版

- pywebview の Cocoa バックエンドで同じ構成（ローカル HTTP＋共通画面）がそのまま動く見込み。**未確認**。
- 資格情報は DPAPI の代わりに Keychain（`keyring` ライブラリ）に保存する。Linux 開発機では平文の代わりに Secret Service を使う。
- PyInstaller で `.app` を作り、`.dmg` にする。GitHub Actions の macOS ランナーでビルドする。
- 秀英体フォントは Windows 版と同じく、配布ビルド時に最新の APK から取り出して同梱する（リポジトリには入れない）。
- メニューバー常駐（rumps または pystray の macOS 対応）。Dock アイコンは、本棚を表示している間だけ出す。
- DeskHatch 側の起動定義は `darwin: { exe: '/Applications/Book Hatch.app/Contents/MacOS/BookHatch', args: ['--background'] }`。
- 署名と公証が無いと、利用者は「右クリック→開く」が必要になる。DeskHatch の `docs/MACOS-INSTALL.md` と同じ案内文を使う。

---

## 5. ファミリー共通化（Theta.xxx.Hatch の土台）

Book Hatch は2番目以降のアプリの見本になるので、Hatch として共通な部分を `desktop/hatch_core/` に切り出し、名刺用・書類用など次のアプリでも流用できるようにする。

|部品|中身|
|---|---|
|`single_instance`|ポートの `/ping` で判定し、動いていれば `/show` して終了|
|`loopback_server`|127.0.0.1 のみ、トークン、`/ping`・`/show`、接続切れの握りつぶし|
|`tray`|トレイ／メニューバー常駐、共通項目（開く・データフォルダ・終了）＋アプリ固有の項目|
|`app_home`|`%LOCALAPPDATA%\Theta\<Name>` と旧名からのコピー移行|
|`store`|webview の `localStorage` を本体側に写す仕組み（`storage.json`、複数ウインドウ間の配信）|
|`update_check`|GitHub Releases の確認（通知だけ）|

`/ping` の共通形式（`expect` は部分一致なので、項目を足しても既存の照合は壊れない）：

```json
{"app":"bookhatch","product":"Theta.Book.Hatch","version":"1.0.0","family":"hatch","protocol":1}
```

ポート表（案。DeskHatch の資料に正本を置く）：

|ポート|アプリ|
|---|---|
|47817|Theta.Book.Hatch（旧 DSBooks）|
|47818–47819|予約|
|47820|DeskHatch skill の例（名刺）。実アプリができたら割り当てる|

---

## 6. 段階計画

|段階|版|内容|確認方法|
|---|---|---|---|
|A|Book Hatch 1.0.0（Windows）|改名（§1）、データのコピー移行、旧スタートアップの削除、`/ping` の拡張、トレイ常駐、旧版が動いている時の案内|`tests/desktop-*.cjs` に改名・移行・旧版検出を追加し、スモークテストを新しい exe 名で実行。実機では旧 DSBooks から上書きして本棚・読書位置・資格情報が残るかを確認|
|B|DeskHatch 側|プリセットを `bookhatch` に差し替え、ポート表と `/ping` の共通形式を資料化|DeskHatch の `tests/localapp*.test.js`（スタブを `bookhatch` に変更）|
|C|Book Hatch 1.1.0（Mac）|Mac ビルド、Keychain、メニューバー常駐、`launch.darwin`|macOS ランナーでのスモークテスト。実機確認は利用者の Mac で|
|D|1.2.0|更新通知、winget 申請、`hatch_core` の切り出し完了|―|
|E|随時|Android の表示名を変えるか（ID と鍵は変えない）|利用者が判断|

### DeskHatch 開発スレへの依頼文（段階 B 用の下書き）

```
DSBooks for Windows は「Theta.Book.Hatch」に改名します（Theta Corp 発行、winget ID 予定 Theta.BookHatch）。
localapp プリセットを配布前に次へ差し替えてください。
- id: 'bookhatch'（partition persist:localapp-bookhatch）, label: L('本棚'), icon: '📚', width: 520
- url: 'http://127.0.0.1:47817/'（ポートは変わりません）, health: '/ping', expect: { app: 'bookhatch' }
- launch.win32: { exe: '%LOCALAPPDATA%\\Programs\\BookHatch\\BookHatch.exe', args: ['--background'] }
- launch.darwin: { exe: '/Applications/Book Hatch.app/Contents/MacOS/BookHatch', args: ['--background'] }（Mac 版の配布後に有効化。それまでは platforms: ['win32']）
- actions: 本棚ウインドウを開く（get:'/show', launchArgs:[]）、表紙キャッシュ作成ツール（launchArgs:['--library-tools']）
- download: Book Hatch のリリースページ
/ping は {"app":"bookhatch","product":"Theta.Book.Hatch","version":"…","family":"hatch","protocol":1} を返します。
あわせて、Theta.xxx.Hatch 共通のポート表（47817=Book Hatch）と /ping の共通形式を LOCALAPP-PROTOCOL.md と companion-app skill に追記してください。
```

---

## 7. 未決事項（利用者の判断待ち）

1. 表示名は「Theta.Book.Hatch」と「Book Hatch」のどちらを主にするか（スタートメニュー、ウインドウタイトル、トレイ）。
2. Android の表示名も変えるか（ID と署名鍵は変えない前提）。
3. Mac の署名・公証のために Apple Developer Program を使うか。
4. Windows のコード署名証明書を用意するか（無ければ SmartScreen の警告が残る）。
5. Bundle ID や配布タグの命名（§1 の案のままでよいか）。
