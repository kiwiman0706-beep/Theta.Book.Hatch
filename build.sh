#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK" ]]; then echo 'Set ANDROID_HOME or ANDROID_SDK_ROOT to the Android SDK directory.' >&2; exit 1; fi
BT="${ANDROID_BUILD_TOOLS:-35.0.0}"
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
"$AAPT" package --auto-add-overlay --extra-packages "$DEP_PACKAGES" -f -m -J "$BUILD/generated" -M "$ROOT/app/src/main/AndroidManifest.xml" "${RES_ARGS[@]}" -A "$ROOT/app/src/main/assets" -I "$ANDROID_JAR"
mapfile -t JAVA_SOURCES < <(find "$ROOT/app/src/main/java" "$BUILD/generated" -name '*.java' -type f | sort)
java com.sun.tools.javac.Main -source 8 -target 8 -classpath "$ANDROID_JAR:$DEP_CP" -d "$BUILD/classes" "${JAVA_SOURCES[@]}"
mapfile -t CLASS_FILES < <(find "$BUILD/classes" -name '*.class' -type f | sort)
"${D8_CMD[@]}" --min-api 26 --lib "$ANDROID_JAR" --output "$BUILD/dex" "${CLASS_FILES[@]}" "${DEP_JARS[@]}"
"$AAPT" package --auto-add-overlay -f -M "$ROOT/app/src/main/AndroidManifest.xml" "${RES_ARGS[@]}" -A "$ROOT/app/src/main/assets" -I "$ANDROID_JAR" -F "$BUILD/unsigned.apk"
python3 "$ROOT/tools/package-apk.py" "$BUILD"
"$ZIPALIGN" -f 4 "$BUILD/aligned-unsigned.apk" "$BUILD/aligned.apk"
if [[ -z "${DSBOOKS_KEYSTORE_PASSWORD:-}" ]]; then read -rsp 'Keystore password: ' DSBOOKS_KEYSTORE_PASSWORD; echo; fi
"$APKSIGNER" sign --ks "$BUILD/dsbooks-0.2.0.keystore" --ks-key-alias dsbooks --ks-pass "pass:$DSBOOKS_KEYSTORE_PASSWORD" --key-pass "pass:$DSBOOKS_KEYSTORE_PASSWORD" --out "$ROOT/DSBooks-0.8.7-preview.apk" "$BUILD/aligned.apk"
"$APKSIGNER" verify --verbose "$ROOT/DSBooks-0.8.7-preview.apk"
