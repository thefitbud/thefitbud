#!/usr/bin/env bash
#
# Builds the PR head as a native Release app for the device gate (Z12-35), pointed at
# the runner's local seeded API instead of staging:
#
#   scripts/qa/device/build-app.sh ios       # macOS: simulator .app
#   scripts/qa/device/build-app.sh android   # Linux or macOS: APK
#
# It reuses the nightly build scripts unchanged in behaviour (scripts/qa/build-ios-sim.sh,
# scripts/qa/build-android-apk.sh: same variant, same Release configuration, same
# signing) and only sets the two hooks they expose:
#   QA_API_BASE_URL        http://127.0.0.1:<port> (iOS) or http://10.0.2.2:<port>
#                          (Android emulator), see lib.sh device_api_url_for;
#   QA_POST_PREBUILD_HOOK  scripts/qa/device/patch-native.sh, which lets the Release
#                          app speak plain HTTP to that host and makes JS warnings
#                          visible in the iOS log. It edits only the generated,
#                          git-ignored native project.
#
# Outputs land where the nightly scripts put them (qa-results/mobile-build/...), and
# the path of the app is written to $DEVICE_RESULTS/<platform>-app-path.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="$(device_platform "${1:-}")"
QA_API_BASE_URL="$(device_api_url_for "$PLATFORM")"
QA_POST_PREBUILD_HOOK="$DEVICE_LIB_DIR/patch-native.sh"
export QA_API_BASE_URL QA_POST_PREBUILD_HOOK

mkdir -p "$DEVICE_RESULTS"
device_log "building the $PLATFORM app against $QA_API_BASE_URL (local seeded API, never staging)"

case "$PLATFORM" in
  ios)
    "$DEVICE_ROOT/scripts/qa/build-ios-sim.sh"
    app="$(find "${QA_IOS_APP_DIR:-$DEVICE_ROOT/qa-results/mobile-build/ios}" -maxdepth 1 -name '*.app' -type d | sort | sed -n 1p)"
    [ -n "$app" ] || device_die "build-ios-sim.sh produced no .app."
    ;;
  android)
    "$DEVICE_ROOT/scripts/qa/build-android-apk.sh"
    app="${QA_APK_PATH:-$DEVICE_ROOT/qa-results/mobile-build/app-release.apk}"
    [ -f "$app" ] || device_die "build-android-apk.sh produced no APK at $app."
    ;;
esac

printf '%s\n' "$app" >"$DEVICE_RESULTS/$PLATFORM-app-path"
device_log "built $app"
