# 0.8.3 自動テスト

PASS: tests/reader-controls-0.8.3.cjs
画像EPUB：ドラッグプレビュー時は章が変わらない、確定時のジャンプ、先頭/末尾、RTLバー、再開。
小説EPUB：章を超えた途中位置へのシーク。フォント・文字サイズの変更後も、変更直前の先頭文字が画面内にある。設定保存。
CBZ/CBR：非同期ページジャンプ、再開。PDF：非同期末尾ジャンプ。Markdown：共通書体設定と変更保存。
PASS: tests/ui-smoke.cjs（既存ページ送り・再開・テーマ・検索・回転・栞など）
PASS: tests/speech-follow-0.8.0.cjs（朗読追従・ハイライト・UTF16/ruby・手動操作・再開）

ネイティブAPIはブラウザテスト用モック。Android実機や実際のNAS通信を検証したという意味ではない。
