# ビルド・署名・配布

## 基準

Android `jp.shinwakai.dsbooks.preview`、versionName `0.8.6-preview`、versionCode `64`。minSDK 26 / targetSDK 34 / compile platform 35。現行はBashによる手動aapt/D8構成。Gradleの推測コマンドではビルドできない。

必要：LinuxまたはWSL、JDK 17以上、Python 3、Android SDK platform 35とbuild-tools 35.0.0、依存取得用ネットワーク、従来の署名鍵。対象環境のSDKライセンス条件を満たすこと。

```sh
cd repository
export ANDROID_HOME=/path/to/android-sdk
python3 scripts/restore_private_assets.py
mkdir -p build
# 別管理の従来の鍵を build/dsbooks-0.2.0.keystore へ配置
bash build.sh
```

鍵aliasは `dsbooks`。パスワードは対話入力、または安全なCI secretとして `DSBOOKS_KEYSTORE_PASSWORD`。このZIPに鍵とパスワードは入っていない。同じ署名鍵を引き継がないと既存アプリに上書きできない。新規鍵でのビルドを既存環境への更新版として渡さない。

## 固定依存

- `tools/prepare-compiler.py`：D8/R8 8.9.35、SHA-256 `204b2fc2b0f4e888dc0ef748b58090def1bf4185068d36abbb94841dbc7107a8`。
- `tools/prepare-dependencies.py`：`third_party/androidx/DEPENDENCIES.json`等の固定URL/ハッシュを使う。LibVLC 3.7.1、Junrar 8.1.2、SLF4J 2.0.17など。
- LibVLC AAR SHA-256：`bc1e14d4344c90e4931ad524671024e9605d599d8ca22a894f709e3c0887fb48`。
- 現行ZIPにSDK/JDK、AAR/JAR本体、ダウンロード済みbuildキャッシュは入っていない。古いREADMEの「依存物同梱」は現行ソースには当てはまらない。
- arm64-v8a / armeabi-v7a / x86 / x86_64の4 ABI。APKサイズが大きい主因はLibVLCネイティブライブラリと内蔵フォント。

## フォント

元のユーザー提供 `ShueiTimes.ttf` は外側の `private-assets/` に分離。復元スクリプトはハッシュを確認して `app/src/main/assets/fonts/` にコピーする。提供/再配布条件は確認できていないので、公開リポジトリに無条件で追加しない。フォントを抜いた場合は同じ0.8.6の完全再現とは呼ばない。

## 出力確認

```sh
python3 -m zipfile -t DSBooks-0.8.6-preview.apk
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose --print-certs DSBooks-0.8.6-preview.apk
"$ANDROID_HOME/build-tools/35.0.0/aapt" dump badging DSBooks-0.8.6-preview.apk
sha256sum DSBooks-0.8.6-preview.apk
```

同梱の基準APKは109,809,860 bytes、SHA-256 `80c8fa21309201bf4a1d9de8e9118fbf07a735e7fb957d6fdddeed0ce6fb97d3`。証明書SHA-256 `dc898a4794814c3670408e97aea3a614f883bd7568a3d40cc9856714f6c4fa06`。再ビルドはZIP時刻などでファイルハッシュが変わり得る。署名者、パッケージ、版、全asset/so、テスト結果を比較する。

配布時はビルド終了後に一意の完成ファイルへコピーし、コピー先のサイズ/ZIP CRC/署名を再確認する。保存やアップロードがtimeoutした場合はリンクを成功扱いにしない。配布先から取得した実バイトも比較する。過去にリンク認証エラーや不完全APKが出ており、ビルド成功だけでは配布成功の証拠にならない。

## PCヘルパー

`thumbnail-helper-release/README.md`を参照。Python 3.10+ / Tkinter、Pillow、PyMuPDF、mutagen、PyYAMLを使用。Windows `setup.bat` とショートカット作成はある。PyInstaller + Inno Setup 6でSetup.exeを作るためのスクリプトがあるが、完成インストーラーの実機検証は未実施。現行ヘルパーは0.3.0相当で、旧READMEの0.1.0表記は履歴由来。

## 次の版

Manifest、Web表示、配布ファイル名、build.sh出力名、診断の版を揃える。versionCodeを増やす。CHANGELOG、ROADMAP、実機チェックリストを更新し、既存データを維持した上書き更新を確認する。この引き継ぎ作業自体はアプリ版を変更しない。
