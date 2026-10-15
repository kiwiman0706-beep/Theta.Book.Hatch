# 0.6.0 自動検証記録

- EpubInspectionTest（JVM）：添付の実EPUBはspine 7 / checked 7 / missing 0。欠損画像、パーセント符号化参照、中止、外部エンティティ遮断のテストもPASS。書名・本文・実EPUBはこのソース配布に含めない。
- sync-0.6.0.cjs：ローカル模擬NASへの実HTTP multipart、2クライアントの同時・逐次同期、新しい低進捗、メモ削除、認証エラーから復帰、2コピーの片方が不正JSON、未登録書籍の進捗保持、PC索引の改名・シリーズ反映、読書中保留、無効化、認証情報非保存。PASS。
- features-0.6.0.cjs：24冊の順序と一覧展開、ウィジェット送信データ24件、全保存ファイルの検査指定、項目別FAIL、未検査の区別、中止、レポート匿名化。PASS。
- storage-0.5.5.cjs：本体／SDの参照保持、取り外し後の復帰、保存先不在時の保護、再生・共有の参照。PASS（模擬ブリッジ）。
- features-0.5.3.cjs：書籍まとめ・メモ・PDF添付・章移動・共有・診断。PASS（新診断リクエスト形式にモックを対応）。
- streaming-0.5.4.cjs：ストリーミング開始、並行保存、別々の停止、ミニプレイヤー、保存済みへの切替。PASS（模擬ブリッジ）。
- ui-smoke.cjs：EPUBページ境界・再開・文字サイズ・画面回転・検索。PASS（生成テキスト）。
- model.cjs：更新日時・メモ削除・パス照合・形式別状態。PASS。
- Android SDK 35でコンパイル、versionCode 54、従来の署名証明書を継続。

未実行：Android実機上のRemoteViews、LibVLC dummy出力でのデコード、PdfRendererの実描画、Synology実機との双方向同期、通知・Bluetooth。これらを自動テスト済みと混同しない。
