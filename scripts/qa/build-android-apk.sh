#!/usr/bin/env bash
#
# Builds the staging-variant Android APK on the CI runner (QA1 · QT7, D-QA1-5).
#
#   scripts/qa/build-android-apk.sh
#
# No EAS, no Maestro Cloud, no EXPO_TOKEN (D-QA1-5, D-QA1-8): `expo prebuild` writes
# apps/mobile/android (git-ignored), then Gradle assembles the APK. The variant values
# are read from apps/mobile/eas.json's `preview` profile with jq, so this script never
# becomes a second place where the staging API URL or the package name is written down.
#
# Environment (all optional):
#   QA_APK_PATH            where to copy the finished APK
#                          (default: qa-results/mobile-build/app-release.apk)
#   QA_ANDROID_GRADLE_TASK Gradle task (default: assembleRelease). QT7's stop condition
#                          allows assembleDebug if a release build ever needs signing
#                          secrets we do not have; it is opt-in, never an automatic
#                          fallback, so a degraded build can never pass unnoticed.
#   QA_PREBUILD_CLEAN=0    keep an existing apps/mobile/android instead of regenerating.
#   QA_API_BASE_URL        replaces eas.json's EXPO_PUBLIC_API_BASE_URL for this build.
#                          Only the device gate sets it (Z12-35, scripts/qa/device/
#                          build-app.sh), to point the same staging variant at the
#                          local seeded API on the runner. Unset: the nightly build is
#                          unchanged.
#   QA_POST_PREBUILD_HOOK  an executable run as `<hook> android <apps/mobile/android>`
#                          right after expo prebuild, before Gradle. The device gate
#                          uses it to patch the generated, git-ignored project
#                          (scripts/qa/device/patch-native.sh). Unset: nothing runs.
#
# Secrets: none. This script reads no secret and prints no value.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
EAS_JSON="$MOBILE/eas.json"
GRADLE_TASK="${QA_ANDROID_GRADLE_TASK:-assembleRelease}"
APK_OUT="${QA_APK_PATH:-$ROOT/qa-results/mobile-build/app-release.apk}"

die() {
  echo "build-android-apk: $1" >&2
  exit 1
}

for tool in jq node; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed."
done

SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
[ -n "$SDK_DIR" ] || die "neither ANDROID_SDK_ROOT nor ANDROID_HOME is set; no Android SDK to build against."
[ -d "$SDK_DIR" ] || die "the Android SDK directory \"$SDK_DIR\" does not exist."

# The generated native project must stay out of git (QT7 acceptance criterion).
if ! git -C "$ROOT" check-ignore -q apps/mobile/android; then
  die "apps/mobile/android is not git-ignored. Generated native projects are never committed."
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
if [ -n "${QA_API_BASE_URL:-}" ]; then
  EXPO_PUBLIC_API_BASE_URL="$QA_API_BASE_URL"
fi
export APP_VARIANT EXPO_PUBLIC_API_BASE_URL EXPO_PUBLIC_TRAINER_WEB_URL
export CI=1

# app.config.js maps APP_VARIANT=staging to this applicationId (D-W4-3).
EXPECTED_PACKAGE="com.thefitbud.mobile.staging"

echo "build-android-apk: variant=$APP_VARIANT api=$EXPO_PUBLIC_API_BASE_URL task=$GRADLE_TASK"

prebuild_args=(prebuild --platform android --no-install)
if [ "${QA_PREBUILD_CLEAN:-1}" = "1" ]; then
  prebuild_args+=(--clean)
fi

echo "build-android-apk: expo prebuild"
(cd "$MOBILE" && pnpm exec expo "${prebuild_args[@]}")

GRADLE_DIR="$MOBILE/android"
[ -x "$GRADLE_DIR/gradlew" ] || die "expo prebuild produced no android/gradlew."

# Fail here rather than after a 15-minute build if the variant did not take effect.
if ! grep -Fq -e "applicationId '${EXPECTED_PACKAGE}'" -e "applicationId \"${EXPECTED_PACKAGE}\"" "$GRADLE_DIR/app/build.gradle"; then
  die "android/app/build.gradle does not set applicationId $EXPECTED_PACKAGE; check APP_VARIANT."
fi

if [ -n "${QA_POST_PREBUILD_HOOK:-}" ]; then
  echo "build-android-apk: post-prebuild hook $QA_POST_PREBUILD_HOOK"
  "$QA_POST_PREBUILD_HOOK" android "$GRADLE_DIR" || die "the post-prebuild hook failed."
fi

echo "build-android-apk: gradle $GRADLE_TASK"
(cd "$GRADLE_DIR" && ./gradlew "$GRADLE_TASK" --no-daemon --stacktrace)

# release -> outputs/apk/release, debug -> outputs/apk/debug.
case "$GRADLE_TASK" in
  assembleRelease) APK_DIR="$GRADLE_DIR/app/build/outputs/apk/release" ;;
  assembleDebug) APK_DIR="$GRADLE_DIR/app/build/outputs/apk/debug" ;;
  *) die "unsupported Gradle task \"$GRADLE_TASK\" (assembleRelease or assembleDebug)." ;;
esac

APK_SRC="$(find "$APK_DIR" -maxdepth 1 -name '*.apk' -type f | sort | sed -n 1p)"
[ -n "$APK_SRC" ] || die "no .apk under $APK_DIR after $GRADLE_TASK."

mkdir -p "$(dirname "$APK_OUT")"
cp "$APK_SRC" "$APK_OUT"

# aapt2 ships with the SDK's build-tools; when present, confirm the real applicationId.
AAPT="$(find "$SDK_DIR/build-tools" -maxdepth 2 -name aapt2 -type f 2>/dev/null | sort -r | sed -n 1p || true)"
if [ -n "$AAPT" ]; then
  if ! "$AAPT" dump packagename "$APK_OUT" | grep -Fqx "$EXPECTED_PACKAGE"; then
    die "the built APK is not $EXPECTED_PACKAGE."
  fi
  echo "build-android-apk: package verified as $EXPECTED_PACKAGE"
else
  echo "build-android-apk: aapt2 not found, package name not verified from the APK" >&2
fi

echo "build-android-apk: wrote $APK_OUT ($(wc -c <"$APK_OUT") bytes)"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "apk=$APK_OUT" >>"$GITHUB_OUTPUT"
fi
