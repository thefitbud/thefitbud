#!/usr/bin/env bash
#
# Puts this commit's JS bundle into a cached native build (Z12-35 native-build cache).
# build-app.sh calls it on a cache hit, i.e. when native-fingerprint.mjs says nothing
# native changed since the cached .app / APK was built.
#
#   scripts/qa/device/swap-bundle.sh ios <FitBudStaging.app>
#   scripts/qa/device/swap-bundle.sh android <app-release.apk>
#
# It does what the Release build's bundle step does, and nothing native:
#   1. `expo export:embed --platform <p> --dev false --minify false --entry-file <abs>/index.js`
#      with the same variant environment as the full build (APP_VARIANT and the
#      EXPO_PUBLIC_* values from eas.json's preview profile, QA_API_BASE_URL on top), so
#      the API URL inlined in the bundle is the local one;
#   2. Hermes bytecode with the hermesc that ships in react-native/sdks/hermesc, with the
#      flags React Native's Release step uses (`-emit-binary -O`; `-w` only silences its warnings). The bytecode version of
#      the new bundle must equal the cached one's, or the script stops: a mismatch would
#      mean the cached binary's Hermes cannot run it (the fingerprint includes the
#      react-native version, so this is a guard, not an expected path);
#   3. iOS: replaces main.jsbundle, copies the bundle's assets into the .app, then signs it
#      ad hoc again with sign-ios-simulator-app.sh (the signature covers main.jsbundle).
#      Android: replaces assets/index.android.bundle, drops the old signature files,
#      zipaligns and signs with the debug keystore, exactly like the full Release build
#      (Expo's template signs release with the debug key). Images are compiled into the
#      APK's resources and cannot be added here: native-fingerprint.mjs hashes every image
#      and font in the repository, and this script checks that every asset the new bundle
#      requires is already a resource of the cached APK (aapt2 dump), exiting 3 for a
#      full native build when one is not (an existing npm image newly required by JS).
#
# Exit 3 = this commit needs a full native build (bytecode or asset mismatch);
# build-app.sh then builds natively instead.
#
# Known, accepted staleness: expo-constants' embedded app config keeps the cached build's
# `extra.bundleCommit` (the dev-only commit badge; never shown in a Release build).
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="$(device_platform "${1:-}")"
TARGET="${2:-}"
[ -n "$TARGET" ] && [ -e "$TARGET" ] || device_die "usage: swap-bundle.sh ios <app> | android <apk>"
MOBILE="$DEVICE_ROOT/apps/mobile"
EAS_JSON="$MOBILE/eas.json"
device_require jq node

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

read_env_var() {
  jq -r --arg k "$1" '.build.preview.env[$k] // empty' "$EAS_JSON"
}
APP_VARIANT="$(read_env_var APP_VARIANT)"
EXPO_PUBLIC_API_BASE_URL="${QA_API_BASE_URL:-$(read_env_var EXPO_PUBLIC_API_BASE_URL)}"
EXPO_PUBLIC_TRAINER_WEB_URL="$(read_env_var EXPO_PUBLIC_TRAINER_WEB_URL)"
export APP_VARIANT EXPO_PUBLIC_API_BASE_URL EXPO_PUBLIC_TRAINER_WEB_URL
export NODE_ENV=production CI=1

case "$(uname -s)" in
  Darwin) HERMESC="$MOBILE/node_modules/react-native/sdks/hermesc/osx-bin/hermesc" ;;
  *) HERMESC="$MOBILE/node_modules/react-native/sdks/hermesc/linux64-bin/hermesc" ;;
esac
[ -x "$HERMESC" ] || device_die "no hermesc at $HERMESC."

# Exit 3 tells build-app.sh to fall back to a full native build: the cached binary
# cannot run this bundle as it is.
needs_native() {
  echo "device[swap-bundle]: $* - a full native build is needed" >&2
  exit 3
}

# Hermes bytecode: 8-byte magic, then the bytecode version as a little-endian uint32.
hbc_version() {
  od -An -t u4 -j 8 -N 4 "$1" | tr -d '[:space:]'
}

bundle() {
  local platform="$1" out="$2" assets="$3"
  device_log "bundling JS for $platform (api=$EXPO_PUBLIC_API_BASE_URL)"
  (cd "$MOBILE" && pnpm exec expo export:embed --platform "$platform" --dev false --minify false \
    --reset-cache --entry-file "$MOBILE/index.js" --bundle-output "$WORK/bundle.js" --assets-dest "$assets") \
    || device_die "expo export:embed failed."
  "$HERMESC" -w -emit-binary -max-diagnostic-width=80 -O -out "$out" "$WORK/bundle.js" \
    || device_die "hermesc failed."
}

case "$PLATFORM" in
  ios)
    APP="$TARGET"
    [ -f "$APP/main.jsbundle" ] || device_die "$APP has no main.jsbundle to replace."
    old="$(hbc_version "$APP/main.jsbundle")"
    bundle ios "$WORK/main.jsbundle" "$APP"
    new="$(hbc_version "$WORK/main.jsbundle")"
    [ "$old" = "$new" ] || needs_native "Hermes bytecode version $new does not match the cached app's $old"
    cp "$WORK/main.jsbundle" "$APP/main.jsbundle"
    BUNDLE_ID="$(plutil -extract CFBundleIdentifier raw "$APP/Info.plist")"
    # shellcheck source=../sign-ios-simulator-app.sh
    source "$DEVICE_ROOT/scripts/qa/sign-ios-simulator-app.sh"
    sign_ios_simulator_app "$APP" "$BUNDLE_ID" || device_die "re-signing the .app failed."
    device_log "swapped main.jsbundle (Hermes bytecode v$new) into $(basename "$APP") and re-signed it"
    ;;
  android)
    APK="$TARGET"
    SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
    BT="$(find "$SDK/build-tools" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | sed -n '$p')"
    [ -n "$BT" ] && [ -x "$BT/zipalign" ] && [ -x "$BT/apksigner" ] || device_die "no zipalign/apksigner under $SDK/build-tools."
    device_require zip unzip keytool
    unzip -p "$APK" assets/index.android.bundle >"$WORK/old.bundle" || device_die "$APK has no assets/index.android.bundle."
    old="$(hbc_version "$WORK/old.bundle")"
    mkdir -p "$WORK/stage/assets" "$WORK/res"
    bundle android "$WORK/stage/assets/index.android.bundle" "$WORK/res"
    new="$(hbc_version "$WORK/stage/assets/index.android.bundle")"
    [ "$old" = "$new" ] || needs_native "Hermes bytecode version $new does not match the cached APK's $old"
    # Every asset the new bundle requires must already be a resource of the cached APK:
    # images and fonts are compiled into resources at build time and cannot be swapped in.
    # A JS-only change can newly require an existing file (even one from an unchanged npm
    # package), which the fingerprint cannot see, so check by resource type/name.
    AAPT2="$BT/aapt2"
    [ -x "$AAPT2" ] || device_die "no aapt2 under $BT."
    "$AAPT2" dump resources "$APK" 2>/dev/null | sed -n 's/^ *resource 0x[0-9a-f]* \([^ ]*\).*/\1/p' | sort -u >"$WORK/apk-resources.txt"
    missing=""
    while IFS= read -r asset; do
      [ -n "$asset" ] || continue
      dir="$(basename "$(dirname "$asset")")"
      name="$(basename "$asset")"
      entry="${dir%%-*}/${name%.*}"
      grep -Fxq "$entry" "$WORK/apk-resources.txt" || missing="$missing $entry"
    done < <(cd "$WORK/res" && find . -type f | sort)
    [ -z "$missing" ] || needs_native "the new bundle requires assets the cached APK does not have:$missing"
    cp "$APK" "$WORK/app.apk"
    zip -q -d "$WORK/app.apk" 'META-INF/MANIFEST.MF' 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/*.EC' 2>/dev/null || true
    (cd "$WORK/stage" && zip -q -0 -X "$WORK/app.apk" assets/index.android.bundle)
    "$BT/zipalign" -f -p 4 "$WORK/app.apk" "$WORK/aligned.apk"
    KEYSTORE="$HOME/.android/debug.keystore"
    if [ ! -f "$KEYSTORE" ]; then
      # Android's well-known debug keystore (public defaults, not a secret), as Gradle makes it.
      mkdir -p "$HOME/.android"
      keytool -genkeypair -keystore "$KEYSTORE" -storepass android -alias androiddebugkey -keypass android \
        -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
    fi
    "$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
      --ks-key-alias androiddebugkey --out "$WORK/signed.apk" "$WORK/aligned.apk"
    "$BT/apksigner" verify "$WORK/signed.apk" || device_die "the re-signed APK does not verify."
    cp "$WORK/signed.apk" "$APK"
    device_log "swapped assets/index.android.bundle (Hermes bytecode v$new) into $(basename "$APK"), zipaligned and signed it"
    ;;
esac
