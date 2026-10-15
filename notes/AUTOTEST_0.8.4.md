# 0.8.4 検証

- 添付ShueiTimes.ttfと内蔵ファイルのSHA256一致。変換・サブセット化なし。
- ブラウザのFontFaceSetで実フォントを読み込み、document.fonts.checkで利用可能なことを確認。
- tests/bundled-font-0.8.4.cjs PASS：EPUBの選択・再開、フォント変更前の文字位置が画面内にあること、Markdownでの共通設定、シークバー／PDF／コミックの既存動作。
- Android実機は未検証。署名付きAPKにフォントが含まれることを別途照合。

Font SHA256: c1349e4b7f32c98b7b761ad1524e32831b61b1d3fbe345f89633c8c841ee6cbb
