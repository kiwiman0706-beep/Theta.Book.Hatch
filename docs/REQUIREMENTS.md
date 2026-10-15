# 利用者要望と対応表

この会話の要望を主題別に統合した索引。逐語録ではない。「実装」はコードの存在であり実機完了とは限らない。機能の正確な限界はCURRENT_STATE/KNOWN_ISSUESを優先する。ファイル名はapp/assetsまたはJava配下の略記。

|ID|要望|状態|根拠・入口|制約/決定|
|---|---|---|---|---|
|R01|NASフォルダをそのまま本棚にする・Calibre依存を除く|実装|dsbooks-prototype.html|専用サーバー/Calibre DB必須にしない|
|R02|NASログイン保持・版の画面表示|実装|MainActivity.java / HTML|2FAは必要時入力|
|R03|EPUB/PDFをアプリ内で開く|実装|EpubContent.java / epub-reader.js / HTML|複雑なEPUBは実機回帰が必要|
|R04|M4A/M4B内蔵再生・大容量対応|実装・実機待ち|MediaPlaybackService.java|LibVLC導入済み。問題実ファイルの成功は未確認|
|R05|オフライン保存|実装|BookDownloadService.java / BookStorage.java|アンインストール時のデータ保持ではない|
|R06|読書/再生位置と進捗の保存・再開|実装|library-model.js / epub-reader.js|章内位置を保存。組版変更時は回帰確認|
|R07|最大化・画像ズーム・パン|実装|comic-reader.js / epub-reader.js|画像の原解像度以上の復元はしない|
|R08|小説のページ概念・章内の進捗|実装|epub-reader.js|全文1章の実例で検証継続|
|R09|スワイプページ送り|実装|epub-reader.js / comic-reader.js|右開き・縦書きと組合せ確認|
|R10|読みかけ再開ウィジェット|実装・実機待ち|ReadingWidgetProvider.java|ランチャー差あり|
|R11|サムネ付きリッチウィジェット|実装・実機待ち|RichReadingWidgetProvider.java / ReadingWidgetService.java|表示/更新/タップを実機確認|
|R12|表紙サムネイル表示|実装|HTML / EpubInspection.java / PC helper|表紙なし・未キャッシュの場合は代替表紙|
|R13|PCでサムネを生成しNASフォルダにキャッシュ|実装|tools/dsbooks_thumbnails.py|全書籍をスマホDLしない構成|
|R14|Windowsインストーラー付きPC GUI|一部|thumbnail-helper-release/|GUI/生成スクリプトあり。Setup.exe未提供・未検証|
|R15|全体DLせず書籍から表紙だけ直接取得|未完|PC helper / BACKLOG|PCキャッシュが主経路。任意形式への汎用Range抽出はない|
|R16|Gemini/Amazon等から表紙候補取得|将来候補|BACKLOG B18|自動送信/取得は未実装|
|R17|フォルダごと横棚、縦に棚を並べる|実装|HTML / library-pages.js|ホームの基本構成|
|R18|木目スキン、黒/緑のコンパクトなヘッダー/フッター|実装|enhancements.css / HTML|木目を緑にしないという明示的希望を保持|
|R19|読みかけ/新着を左に・POP/進捗を表示|実装|HTML / library-list.js|現行リストにも読みかけ固定を持つ|
|R20|音声本をレコードジャケット風にする|実装|enhancements.css / HTML|ディスクは上/右上に出し横幅を浪費しない|
|R21|本/フォルダ名のコントラスト・余白削減|実装|enhancements.css|暗い背景では明るい文字|
|R22|Chromecastへキャスト|一部・実機待ち|CastAudio.java / cast-audio.js|保存済み音声・同一LAN。TTS/本の画面/NAS未保存は未対応|
|R23|Android TV対応|一部・実機待ち|device-integration.js / Manifest|Leanback/DPAD試行。TVでの読書体験・VPN環境は要実機|
|R24|Android Auto対応|一部・実機待ち|CarBrowserService.java / CarLibrary.java|保存済み音声のメディア導線|
|R25|Tailscale起動案内とNAS自動再接続|実装・実機待ち|nas-connection.js / MainActivity.java|VPNを勝手にオンにはしない。到達不可をVPNオフと断定しない|
|R26|読書中の戻るで本棚に戻る|実装|MainActivity.java / library-navigation.js|子パネルを優先して閉じる|
|R27|フォルダ一覧の戻るでホームに戻る|実装|library-navigation.js|画面状態の履歴を保持|
|R28|ファイルを他アプリへ共有/保存|実装|DocumentExchange.java / LocalBookProvider.java|端末保存が前提。受信先の形式/容量制限あり|
|R29|他アプリからEPUB/PDF等を受け取る|一部/要確認|DocumentExchange.java / Manifest / BACKLOG B14|送信と受信は別。全ACTION_SEND/VIEW導線の完成扱いをしない|
|R30|複数端末の進捗同期|実装・実機待ち|nas-sync.js / library-model.js|NAS JSON手動/自動。競合UI未完成|
|R31|thumbs.dbの再利用|見送り|DEVELOPMENT_HISTORY.md|複雑な互換を優先しないとの合意|
|R32|NAS内でキャッシュ生成ツールを動かす|将来候補|BACKLOG B15|常駐管理サーバーを必須にはしない|
|R33|著者・シリーズ認識、スタック、タグ|一部|work-model.js / dsbooks_metadata.py / enhancements.js|シリーズ/巻/タグを実装。全自動書誌同定は未完|
|R34|フォルダ横断の作者ジャンプ|低優先|DEVELOPMENT_HISTORY.md|利用者が重要度を下げた。シリーズを優先|
|R35|サーバー不要のID/JSON/Markdown・Obsidian互換|実装|dsbooks_metadata.py / library-model.js|原本へのID埋込でなくsidecar。改名照合に条件あり|
|R36|DLをバックグラウンドタスク化|一部|BookDownloadService.java|foreground service。永続キュー・再起動復旧は未完|
|R37|DL後その画面から開く|実装|HTML / enhancements.js|保存完了後の状態更新を確認|
|R38|音声画面に表紙表示|実装・実機待ち|work-library.js / enhancements.js|表紙未取得なら代替。全ファイルに保証しない|
|R39|NAS音声ストリーミング|実装・実機待ち|NasAudioSource.java / audio-streaming.js|Range/認証/切断復帰を実NASで確認|
|R40|DLしながら聴く|一部|audio-streaming.js / BookDownloadService.java|現在は独立DL+ストリーム。共通部分キャッシュではない|
|R41|同名M4BとPDF添付資料を一冊にまとめる|実装|work-model.js / work-library.js|フォルダ内同名。位置は形式別|
|R42|小説EPUBの読み上げ|実装|epub-speech.js / MediaPlaybackService.java|Android TTS。画像だけの本文のOCRはない|
|R43|本棚に戻っても操作できるミニプレイヤー|実装|enhancements.js / MediaPlaybackService.java|音声とTTSの一時停止/停止/復帰|
|R44|OS通知/MediaSessionで音声・TTSを操作|実装・実機待ち|MediaPlaybackService.java|ロック画面/Bluetooth/消灯は実機検証|
|R45|実機チェックリストをロードマップから分離|実装|CHECKLIST_DEVICE_*.md|自動テスト結果と手動未確認を区別|
|R46|セルフテストとJSONレポート|実装|diagnostics.js / DeviceDiagnostics.java / FileExercise.java|深い検査も一部あり。音声/見た目の完全自動判定ではない|
|R47|保存ファイルで半自動回帰テスト|一部|FileExercise.java / BACKLOG B13|比較・課題への自動整理は今後|
|R48|M4Bチャプター一覧・ジャンプ|実装|IsoChapterParser.java / work-library.js|形式差あり。標準解析失敗と章抽出成功は両立する|
|R49|共有してNotebookLM等で要約|一部|DocumentExchange.java|汎用共有のみ。NotebookLM連携API/自動送信はない|
|R50|要約・メモを本に関連付ける|実装|work-library.js / library-model.js|メモ同期と形式別位置を分離|
|R51|SDカードをDL先に選ぶ|一部|BookStorage.java / download-storage.js|アプリ専用領域。任意フォルダ/一括移動は未完|
|R52|読書中を3冊以上表示|実装|reading-shelf.js / library-pages.js|初期24件等の分割描画。全データを削除しない|
|R53|フォルダを開いたら横スクロールでなく折返し一覧|実装|library-navigation.js / library-pages.js|ホーム横棚とフォルダ内グリッドを区別|
|R54|朗読を今見ているページから開始|実装|epub-speech.js / epub-reader.js|章頭からに戻さない|
|R55|朗読に合わせてページ送り・箇所強調|実装|SpeechCursor.java / epub-reader.js|TTS範囲通知に応じ文/範囲を追う|
|R56|大量蔵書で白画面/フリーズを抑える|実装・継続課題|startup.js / library-pages.js|分割表示。件数を切って保存しない|
|R57|対象フォルダ名変更後の古い表示を解消|実装・実機待ち|HTML scanner / scan-scope tests|範囲除外とオフライン本削除を区別|
|R58|SVG等のEPUBコミック表示|実装|EpubContent.java / EpubInspection.java|白紙例から対応。すべての出版社構造を保証しない|
|R59|CBZ/CBR対応|実装|ComicArchive.java / comic-reader.js|RAR4/5。破損/暗号化/巨大ファイルは検証必要|
|R60|シークバーでページジャンプ|実装|epub-reader.js / comic-reader.js|文字変更後のページ総数に追従|
|R61|小説フォント変更と提供フォント内蔵|実装|epub-reader.js / fonts|提供フォントはGitHub用フォルダ外に分離|
|R62|小説縦書き|実装・実機待ち|epub-reader.js|手動切替。ルビ/縦中横/禁則は継続検証|
|R63|本棚リスト表示・並べ替え|実装|library-list.js / CHECKLIST_DEVICE_0.8.6.md|9種・昇降順・読みかけ固定・設定保存|
|R64|Windows/Mac版・個人用IPA|未実装/検討|BACKLOG B16/B17|PCキャッシュツールは閲覧クライアントではない|
|R65|署名鍵を別途受け取れるようにする|別管理|BUILD_AND_RELEASE.md|過去鍵の存在は確認。今回ZIPには含めない|
|R66|切れないAPK配布リンク・インストール可能な成果物|継続課題|BUILD_AND_RELEASE.md|保存/転送後の実バイト検証まで必要|
|R67|AI/GitHub向け開発一式のZIP|今回作成|START_HERE.md / AI_HANDOFF.md|本物のGit履歴を捏造しない。欠落明記|
