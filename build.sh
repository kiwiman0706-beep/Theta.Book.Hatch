#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK" ]]; then echo 'Set ANDROID_HOME or ANDROID_SDK_ROOT to the Android SDK directory.' >&2; exit 1; fi
BT="${ANDROID_BUILD_TOOLS:-35.0.0}"
# Theta Book Hatch (Theta.Hatch.Series): application id app.thetahatch.book, the series key from the CI secrets.
# Java classes and R stay in jp.shinwakai.dsbooks.preview; only the application id is renamed at packaging.
# The manifest is written per build into build/manifest (id, provider authority <id>.files, label, version), so one
# source builds:
#   default                       Theta Book Hatch      app.thetahatch.book         ThetaBookHatch-<ver>.apk
#   DSBOOKS_APP_ID=jp.shinwakai.dsbooks.claude (+ DSBOOKS_VERSION_NAME/CODE)  the migration bridge on the old id/key
#   DSBOOKS_VARIANT=viewer        Theta.Jisui.Viewer    com.theta.jisuiviewer       (tools/make-viewer-variant.py)
# Signing: DSBOOKS_KEYSTORE (file), DSBOOKS_KEY_ALIAS, DSBOOKS_KEYSTORE_PASSWORD, DSBOOKS_KEY_PASSWORD (defaults to the
# store password). CI fills them from ANDROID_KEYSTORE_B64 / ANDROID_KEY_ALIAS / ANDROID_KEYSTORE_PASSWORD /
# ANDROID_KEY_PASSWORD; the alias is never written here for the series key.
VARIANT="${DSBOOKS_VARIANT:-}"
SRC_MANIFEST="$ROOT/app/src/main/AndroidManifest.xml"
MANIFEST="$ROOT/build/manifest/AndroidManifest.xml"
ASSETS="$ROOT/app/src/main/assets"
if [[ "$VARIANT" == viewer ]]; then
  APP_ID="${DSBOOKS_APP_ID:-com.theta.jisuiviewer}"
  VIEWER_VERSION="$(sed -n 's/^APP_VERSION = "\([0-9.]*\)-desktop"/\1/p' "$ROOT/desktop/bridge.py")"
  python3 "$ROOT/tools/make-viewer-variant.py" "$ROOT" "$ROOT/build/viewer" "$APP_ID" "$VIEWER_VERSION"
  SRC_MANIFEST="$ROOT/build/viewer/AndroidManifest.xml"
  ASSETS="$ROOT/build/viewer/assets"
else
  APP_ID="${DSBOOKS_APP_ID:-app.thetahatch.book}"
fi
LABEL="Theta Book Hatch"; [[ "$APP_ID" == jp.shinwakai.dsbooks.* ]] && LABEL="DSBooks Claude"; [[ "$VARIANT" == viewer ]] && LABEL="Theta.Jisui.Viewer"
mkdir -p "$ROOT/build/manifest"
python3 - "$SRC_MANIFEST" "$MANIFEST" "$APP_ID" "$LABEL" "${DSBOOKS_VERSION_NAME:-}" "${DSBOOKS_VERSION_CODE:-}" <<'PY'
import re, sys
src, out, app_id, label, vname, vcode = sys.argv[1:7]
m = open(src, encoding="utf-8").read()
m = re.sub(r'android:authorities="[^"]+\.files"', 'android:authorities="%s.files"' % app_id, m, count=1)
m = re.sub(r'(<application\b[^>]*?android:label=")[^"]*(")', lambda x: x.group(1) + label + x.group(2), m, count=1)
if vname: m = re.sub(r'android:versionName="[^"]*"', 'android:versionName="%s"' % vname, m, count=1)
if vcode: m = re.sub(r'android:versionCode="[^"]*"', 'android:versionCode="%s"' % vcode, m, count=1)
open(out, "w", encoding="utf-8").write(m)
PY
VERSION_NAME="$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' "$MANIFEST")"
if [[ "$VARIANT" == viewer ]]; then OUT_APK="$ROOT/ThetaJisuiViewer-$VERSION_NAME.apk"
elif [[ "$APP_ID" == jp.shinwakai.dsbooks.* ]]; then OUT_APK="$ROOT/DSBooks-$VERSION_NAME.apk"
else OUT_APK="$ROOT/ThetaBookHatch-$VERSION_NAME.apk"; fi
KEYSTORE="${DSBOOKS_KEYSTORE:-$ROOT/build/dsbooks-claude.keystore}"
KEY_ALIAS="${DSBOOKS_KEY_ALIAS:-dsbooks-claude}"
if ! grep -q "android:authorities=\"$APP_ID.files\"" "$MANIFEST"; then echo "Provider authority must be $APP_ID.files" >&2; exit 1; fi
AAPT="$SDK/build-tools/$BT/aapt"
D8="$SDK/build-tools/$BT/d8"
D8_JAR="$SDK/build-tools/$BT/lib/d8.jar"
ZIPALIGN="$SDK/build-tools/$BT/zipalign"
APKSIGNER="$SDK/build-tools/$BT/apksigner"
ANDROID_JAR="$SDK/platforms/android-35/android.jar"
for f in "$AAPT" "$D8" "$ZIPALIGN" "$APKSIGNER" "$ANDROID_JAR"; do [[ -e "$f" ]] || { echo "Missing SDK tool: $f" >&2; exit 1; }; done
python3 "$ROOT/tools/prepare-compiler.py"
D8_CMD=(java -cp "$ROOT/build/r8-8.9.35.jar" com.android.tools.r8.D8)
BUILD="$ROOT/build"
mkdir -p "$BUILD/classes" "$BUILD/dex" "$BUILD/generated"
rm -rf "$BUILD/classes" "$BUILD/dex" "$BUILD/generated"
mkdir -p "$BUILD/classes" "$BUILD/dex" "$BUILD/generated"
python3 "$ROOT/tools/prepare-dependencies.py"
mapfile -t DEP_JARS < "$BUILD/dependencies/jars.txt"
mapfile -t DEP_RES < "$BUILD/dependencies/resources.txt"
DEP_PACKAGES="$(cat "$BUILD/dependencies/packages.txt")"
DEP_CP="$(IFS=:; echo "${DEP_JARS[*]}")"
RES_ARGS=(-S "$ROOT/app/src/main/res")
for res in "${DEP_RES[@]}"; do RES_ARGS+=(-S "$res"); done
"$AAPT" package --auto-add-overlay --extra-packages "$DEP_PACKAGES" -f -m -J "$BUILD/generated" -M "$MANIFEST" "${RES_ARGS[@]}" -A "$ASSETS" -I "$ANDROID_JAR"
mapfile -t JAVA_SOURCES < <(find "$ROOT/app/src/main/java" "$BUILD/generated" -name '*.java' -type f | sort)
java com.sun.tools.javac.Main -source 8 -target 8 -classpath "$ANDROID_JAR:$DEP_CP" -d "$BUILD/classes" "${JAVA_SOURCES[@]}"
mapfile -t CLASS_FILES < <(find "$BUILD/classes" -name '*.class' -type f | sort)
"${D8_CMD[@]}" --min-api 26 --lib "$ANDROID_JAR" --output "$BUILD/dex" "${CLASS_FILES[@]}" "${DEP_JARS[@]}"
"$AAPT" package --auto-add-overlay -f --rename-manifest-package "$APP_ID" -M "$MANIFEST" "${RES_ARGS[@]}" -A "$ASSETS" -I "$ANDROID_JAR" -F "$BUILD/unsigned.apk"
python3 "$ROOT/tools/package-apk.py" "$BUILD"
"$ZIPALIGN" -f 4 "$BUILD/aligned-unsigned.apk" "$BUILD/aligned.apk"
if [[ -z "${DSBOOKS_KEYSTORE_PASSWORD:-}" ]]; then read -rsp 'Keystore password: ' DSBOOKS_KEYSTORE_PASSWORD; echo; fi
export DSBOOKS_KEYSTORE_PASSWORD
export DSBOOKS_KEY_PASSWORD="${DSBOOKS_KEY_PASSWORD:-$DSBOOKS_KEYSTORE_PASSWORD}"
"$APKSIGNER" sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" --ks-pass env:DSBOOKS_KEYSTORE_PASSWORD --key-pass env:DSBOOKS_KEY_PASSWORD --out "$OUT_APK" "$BUILD/aligned.apk"
"$APKSIGNER" verify --verbose --print-certs "$OUT_APK"
