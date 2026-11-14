#!/usr/bin/env bash
#
# Builds the PR head as a native Release app for the device gate (Z12-35), pointed at
# the runner's local seeded API instead of staging:
#
#   scripts/qa/device/build-app.sh ios       # macOS: simulator .app
#   scripts/qa/device/build-app.sh android   # Linux or macOS: APK
#
# Full build (cache miss, or no cache): the nightly build scripts, unchanged in
# behaviour (scripts/qa/build-ios-sim.sh, scripts/qa/build-android-apk.sh: same variant,
# same Release configuration, same signing), with the hooks they expose:
#   QA_API_BASE_URL        http://127.0.0.1:<port> (iOS) or http://10.0.2.2:<port>
#                          (Android emulator), see lib.sh device_api_url_for;
#   QA_POST_PREBUILD_HOOK  scripts/qa/device/patch-native.sh (generated project only);
#   QA_IOS_ARCHS           the runner's own architecture: the simulator on an arm64
#                          runner needs only arm64, which halves the iOS compile.
# The finished app is then copied to the native cache directory, which device.yml saves
# under the key native-fingerprint.mjs computed.
#
# Cache hit (DEVICE_NATIVE_CACHE=hit and the cached app restored): the cached native
# build is reused and only this commit's JS bundle is rebuilt and swapped in
# (swap-bundle.sh). Every task in W12 except Z12-57 is JS-only, so this is the normal
# path once the cache is warm.
#
# Outputs land where the nightly scripts put them (qa-results/mobile-build/...); the
# app's path goes to $DEVICE_RESULTS/<platform>-app-path and the build mode and time to
# $DEVICE_RESULTS/build-<platform>.json (shown in the gate summary).
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="$(device_platform "${1:-}")"
QA_API_BASE_URL="$(device_api_url_for "$PLATFORM")"
QA_POST_PREBUILD_HOOK="$DEVICE_LIB_DIR/patch-native.sh"
export QA_API_BASE_URL QA_POST_PREBUILD_HOOK
if [ "$PLATFORM" = "ios" ] && [ -z "${QA_IOS_ARCHS:-}" ]; then
  QA_IOS_ARCHS="$(uname -m)"
  export QA_IOS_ARCHS
fi

CACHE_DIR="${DEVICE_NATIVE_CACHE_DIR:-$DEVICE_ROOT/qa-results/device-native-cache}/$PLATFORM"
IOS_APP_DIR="${QA_IOS_APP_DIR:-$DEVICE_ROOT/qa-results/mobile-build/ios}"
APK="${QA_APK_PATH:-$DEVICE_ROOT/qa-results/mobile-build/app-release.apk}"
mkdir -p "$DEVICE_RESULTS"
started="$(date +%s)"

cached_app() {
  case "$PLATFORM" in
    ios) find "$CACHE_DIR" -maxdepth 1 -name '*.app' -type d 2>/dev/null | sort | sed -n 1p ;;
    android) [ -f "$CACHE_DIR/app-release.apk" ] && printf '%s' "$CACHE_DIR/app-release.apk" ;;
  esac
}

mode="full"
cached="$(cached_app || true)"
if [ "${DEVICE_NATIVE_CACHE:-miss}" = "hit" ] && [ -n "$cached" ]; then
  mode="cache-hit"
  device_log "native cache hit: reusing $(basename "$cached"), rebuilding only the JS bundle against $QA_API_BASE_URL"
  case "$PLATFORM" in
    ios)
      rm -rf "$IOS_APP_DIR"
      mkdir -p "$IOS_APP_DIR"
      cp -R "$cached" "$IOS_APP_DIR/"
      app="$IOS_APP_DIR/$(basename "$cached")"
      ;;
    android)
      mkdir -p "$(dirname "$APK")"
      cp "$cached" "$APK"
      app="$APK"
      ;;
  esac
  "$DEVICE_LIB_DIR/swap-bundle.sh" "$PLATFORM" "$app"
else
  [ "${DEVICE_NATIVE_CACHE:-}" = "hit" ] && device_warn "the native cache reported a hit but holds no app; doing a full build"
  device_log "full native build of the $PLATFORM app against $QA_API_BASE_URL (local seeded API, never staging)"
  case "$PLATFORM" in
    ios)
      "$DEVICE_ROOT/scripts/qa/build-ios-sim.sh"
      app="$(find "$IOS_APP_DIR" -maxdepth 1 -name '*.app' -type d | sort | sed -n 1p)"
      [ -n "$app" ] || device_die "build-ios-sim.sh produced no .app."
      ;;
    android)
      "$DEVICE_ROOT/scripts/qa/build-android-apk.sh"
      app="$APK"
      [ -f "$app" ] || device_die "build-android-apk.sh produced no APK at $app."
      ;;
  esac
  rm -rf "$CACHE_DIR"
  mkdir -p "$CACHE_DIR"
  cp -R "$app" "$CACHE_DIR/"
  device_log "copied the native build to $CACHE_DIR for the cache"
fi

seconds=$(( $(date +%s) - started ))
printf '%s\n' "$app" >"$DEVICE_RESULTS/$PLATFORM-app-path"
jq -n --arg mode "$mode" --argjson s "$seconds" --arg key "${DEVICE_NATIVE_CACHE_KEY:-}" \
  '{result: "\($mode) in \($s) s", mode: $mode, seconds: $s, cacheKey: $key}' >"$DEVICE_RESULTS/build-$PLATFORM.json"
device_log "built $app ($mode, ${seconds}s)"
