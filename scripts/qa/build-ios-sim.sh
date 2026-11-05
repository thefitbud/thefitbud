#!/usr/bin/env bash
#
# Builds the staging-variant iOS app for the simulator on a macOS CI runner
# (W3b · CU19, D-W3b-14). The Android twin is scripts/qa/build-android-apk.sh and
# the two are deliberately shaped the same way.
#
#   scripts/qa/build-ios-sim.sh
#
# No EAS, no Maestro Cloud, no EXPO_TOKEN (D-QA1-8, D-W3b-14): `expo prebuild`
# writes apps/mobile/ios (git-ignored), CocoaPods installs the pods, then
# xcodebuild builds the app for the iOS Simulator SDK. The variant values are read
# from apps/mobile/eas.json's `preview` profile with jq, exactly as the Android
# script does, so this file never becomes a second place where the staging API URL
# or the bundle identifier is written down. apps/mobile/eas.json is NOT changed.
#
# Release, not Debug: a Release build embeds the JS bundle and compiles it to
# Hermes bytecode, which is the only configuration that reproduces the CU17 class
# of bug (an iOS-only Hermes Intl failure). A Debug build would load from a Metro
# server and run different code. The build is asserted to contain main.jsbundle
# for that reason.
#
# xcodebuild itself does not sign (CODE_SIGNING_ALLOWED=NO). The runner has no
# development certificate, and the app's push and App Group entitlements would
# make a normal signature demand one. The keychain entitlements are embedded in
# the binary by the linker (LD_ENTITLEMENTS_SECTION) and the .app is ad-hoc
# signed afterwards, with no entitlements in the signature
# (sign-ios-simulator-app.sh, Z5-5). Without the entitlements SecureStore fails
# with -34018 and the auth screen never appears (CU25); with them in the
# signature the app is killed at launch (Z5-5). Ad-hoc signing needs no
# certificate and no secret.
#
# Environment (all optional):
#   QA_IOS_APP_DIR     where the finished .app is copied
#                      (default: qa-results/mobile-build/ios)
#   QA_IOS_DERIVED_DATA  xcodebuild -derivedDataPath
#                      (default: qa-results/ios-build)
#   QA_IOS_CONFIGURATION  Release (default) or Debug. Debug is opt-in only and is
#                      never an automatic fallback: it would not embed the bundle,
#                      so a degraded build must not be able to pass unnoticed.
#   QA_PREBUILD_CLEAN=0  keep an existing apps/mobile/ios instead of regenerating.
#   QA_IOS_SCHEME      override the discovered Xcode scheme.
#
# Secrets: none. This script reads no secret and prints no value.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
EAS_JSON="$MOBILE/eas.json"
CONFIGURATION="${QA_IOS_CONFIGURATION:-Release}"
APP_DIR="${QA_IOS_APP_DIR:-$ROOT/qa-results/mobile-build/ios}"
DERIVED="${QA_IOS_DERIVED_DATA:-$ROOT/qa-results/ios-build}"

die() {
  echo "build-ios-sim: $1" >&2
  exit 1
}

case "$CONFIGURATION" in
  Release | Debug) ;;
  *) die "QA_IOS_CONFIGURATION must be Release or Debug, not \"$CONFIGURATION\"." ;;
esac

[ "$(uname -s)" = "Darwin" ] || die "this script only runs on macOS; Xcode is required."

for tool in jq node xcodebuild xcrun pod plutil; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed."
done

# The generated native project must stay out of git, as on Android (QT7).
if ! git -C "$ROOT" check-ignore -q apps/mobile/ios; then
  die "apps/mobile/ios is not git-ignored. Generated native projects are never committed."
fi

# One source of truth for the variant: eas.json's preview profile (D-W4-3).
read_env_var() {
  local key="$1" value
  value="$(jq -r --arg k "$key" '.build.preview.env[$k] // empty' "$EAS_JSON")"
  [ -n "$value" ] || die "eas.json has no build.preview.env.$key."
  printf '%s' "$value"
}

APP_VARIANT="$(read_env_var APP_VARIANT)"
EXPO_PUBLIC_API_BASE_URL="$(read_env_var EXPO_PUBLIC_API_BASE_URL)"
EXPO_PUBLIC_TRAINER_WEB_URL="$(read_env_var EXPO_PUBLIC_TRAINER_WEB_URL)"
[ "$APP_VARIANT" = "staging" ] || die "eas.json's preview profile is APP_VARIANT=$APP_VARIANT, expected staging."
export APP_VARIANT EXPO_PUBLIC_API_BASE_URL EXPO_PUBLIC_TRAINER_WEB_URL
export CI=1
# apps/mobile/app.config.js maps APP_VARIANT=staging to this bundle identifier, the
# same value as the Android applicationId, which is why the Maestro flows need no
# per-platform appId (CU18).
EXPECTED_BUNDLE_ID="com.thefitbud.mobile.staging"

echo "build-ios-sim: variant=$APP_VARIANT api=$EXPO_PUBLIC_API_BASE_URL configuration=$CONFIGURATION"
echo "build-ios-sim: xcode $(xcodebuild -version | head -n 1) at $(xcode-select -p)"

prebuild_args=(prebuild --platform ios --no-install)
if [ "${QA_PREBUILD_CLEAN:-1}" = "1" ]; then
  prebuild_args+=(--clean)
fi

echo "build-ios-sim: expo prebuild"
(cd "$MOBILE" && pnpm exec expo "${prebuild_args[@]}")

IOS_DIR="$MOBILE/ios"
[ -d "$IOS_DIR" ] || die "expo prebuild produced no apps/mobile/ios."

# shellcheck source=ios-build-helpers.sh
source "$(dirname "${BASH_SOURCE[0]}")/ios-build-helpers.sh"

echo "build-ios-sim: pod install"
(cd "$IOS_DIR" && pod_install_with_retry) || die "pod install failed."

WORKSPACE="$(find "$IOS_DIR" -maxdepth 1 -name '*.xcworkspace' -type d | sort | head -n 1)"
[ -n "$WORKSPACE" ] || die "no .xcworkspace under apps/mobile/ios after pod install."

# Discover the scheme rather than hardcoding it: it is derived from the app name in
# app.config.js, so a rename would otherwise fail here with an opaque xcodebuild error.
if [ -n "${QA_IOS_SCHEME:-}" ]; then
  SCHEME="$QA_IOS_SCHEME"
else
  SCHEMES="$(xcodebuild -workspace "$WORKSPACE" -list -json | jq -r '.workspace.schemes[]?')"
  [ -n "$SCHEMES" ] || die "xcodebuild -list reported no schemes for $(basename "$WORKSPACE")."
  # Pods and the Live Activity target (LA1) also appear as schemes; the app scheme is
  # the one matching the Xcode project directory name.
  PROJECT_NAME="$(basename "$(find "$IOS_DIR" -maxdepth 1 -name '*.xcodeproj' -type d | sort | head -n 1)" .xcodeproj)"
  SCHEME="$(printf '%s\n' "$SCHEMES" | grep -Fx "$PROJECT_NAME" || true)"
  [ -n "$SCHEME" ] || die "none of the schemes [$(printf '%s' "$SCHEMES" | tr '\n' ' ')] matches the project name \"$PROJECT_NAME\"; set QA_IOS_SCHEME."
fi
echo "build-ios-sim: workspace=$(basename "$WORKSPACE") scheme=$SCHEME"

# @sentry/react-native's Xcode phases resolve @sentry/cli from apps/mobile/ios, where
# pnpm does not link it, and fail the build before they read
# SENTRY_DISABLE_AUTO_UPLOAD (Z5-5, see ios-build-helpers.sh). xcodebuild passes its
# environment to the phase scripts, which skip that resolve when this is set. The
# upload stays off: nothing here enables it.
SENTRY_CLI_EXECUTABLE="$(resolve_sentry_cli "$MOBILE")" || die "cannot locate @sentry/react-native's sentry-cli; the Sentry Xcode phases would fail the build."
export SENTRY_CLI_EXECUTABLE
echo "build-ios-sim: sentry-cli for the Xcode phases at $SENTRY_CLI_EXECUTABLE"

# The keychain entitlements go into the binary, not the code signature (Z5-5, see
# sign-ios-simulator-app.sh): the linker embeds this plist in __TEXT,__entitlements,
# which is where the simulator reads entitlements from, exactly as Xcode does for its
# own simulator builds. An ad-hoc signature carrying them is killed at launch.
SIM_ENTITLEMENTS="$DERIVED/simulator-entitlements.xcent"
mkdir -p "$DERIVED"
node "$ROOT/scripts/qa/simulator-keychain-entitlements.mjs" "$EXPECTED_BUNDLE_ID" >"$SIM_ENTITLEMENTS" \
  || die "could not write the simulator entitlements plist."
echo "build-ios-sim: embedding $SIM_ENTITLEMENTS in __TEXT,__entitlements"

echo "build-ios-sim: xcodebuild"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  LD_ENTITLEMENTS_SECTION="$SIM_ENTITLEMENTS" \
  build

PRODUCTS="$DERIVED/Build/Products/$CONFIGURATION-iphonesimulator"
APP_SRC="$(find "$PRODUCTS" -maxdepth 1 -name '*.app' -type d | sort | head -n 1)"
[ -n "$APP_SRC" ] || die "no .app under $PRODUCTS after the build."

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
cp -R "$APP_SRC" "$APP_DIR/"
APP_OUT="$APP_DIR/$(basename "$APP_SRC")"

BUILT_ID="$(plutil -extract CFBundleIdentifier raw "$APP_OUT/Info.plist")"
[ "$BUILT_ID" = "$EXPECTED_BUNDLE_ID" ] || die "the built app is $BUILT_ID, not $EXPECTED_BUNDLE_ID; check APP_VARIANT."
echo "build-ios-sim: bundle identifier verified as $BUILT_ID"

# A Release build must carry the JS bundle: without it the app would try to reach a
# Metro server that does not exist on the runner, and every flow would fail for a
# reason that has nothing to do with the product.
if [ "$CONFIGURATION" = "Release" ] && [ ! -f "$APP_OUT/main.jsbundle" ]; then
  die "the Release app has no main.jsbundle; the JS bundle was not embedded, so this build cannot exercise Hermes."
fi

# shellcheck source=sign-ios-simulator-app.sh
source "$(dirname "${BASH_SOURCE[0]}")/sign-ios-simulator-app.sh"
sign_ios_simulator_app "$APP_OUT" "$BUILT_ID" || die "ad-hoc signing failed; an unsigned app cannot read the keychain and never reaches the auth screen."

echo "build-ios-sim: wrote $APP_OUT"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "app=$APP_OUT" >>"$GITHUB_OUTPUT"
fi
