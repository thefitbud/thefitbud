#!/usr/bin/env bash
#
# Installs the emulator system image before reactivecircus/android-emulator-runner
# needs it, retrying a failed download (Z5-5, diagnosis on #241).
#
#   scripts/qa/android-system-image.sh
#
# emulator-runner runs `sdkmanager --install 'system-images;android-34;google_apis;x86_64'`
# once and gives up on any error. In run 41960026903 that download arrived corrupt
# ("Error on ZipFile unknown archive"), the emulator never started, and the job
# failed in 39 s with no logcat; the same app had passed ten minutes earlier.
# Installing it here first, with retries, makes emulator-runner's own install a
# no-op. A package only counts as installed when sdkmanager exits 0 AND its
# package.xml exists, because a failed unpack can leave sdkmanager's exit status
# unhelpful.
#
# Environment (all optional):
#   QA_ANDROID_SYSTEM_IMAGE   default: system-images;android-34;google_apis;x86_64
#                             (must match the api-level/target/arch in qa.yml)
#   QA_SDKMANAGER_ATTEMPTS    default: 3
#   QA_SDKMANAGER_RETRY_DELAY seconds between attempts, default: 15
#   SDKMANAGER                path to sdkmanager (default: the SDK's cmdline-tools,
#                             then PATH)
#
# Secrets: none.
set -euo pipefail

IMAGE="${QA_ANDROID_SYSTEM_IMAGE:-system-images;android-34;google_apis;x86_64}"
ATTEMPTS="${QA_SDKMANAGER_ATTEMPTS:-3}"
DELAY="${QA_SDKMANAGER_RETRY_DELAY:-15}"

die() {
  echo "android-system-image: $1" >&2
  exit 1
}

SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
[ -n "$SDK_DIR" ] || die "neither ANDROID_SDK_ROOT nor ANDROID_HOME is set."
[ -d "$SDK_DIR" ] || die "the Android SDK directory \"$SDK_DIR\" does not exist."

if [ -z "${SDKMANAGER:-}" ]; then
  if [ -x "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" ]; then
    SDKMANAGER="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"
  elif command -v sdkmanager >/dev/null 2>&1; then
    SDKMANAGER="$(command -v sdkmanager)"
  else
    die "sdkmanager not found under $SDK_DIR/cmdline-tools/latest/bin or on PATH."
  fi
fi

# 'system-images;android-34;google_apis;x86_64' -> system-images/android-34/google_apis/x86_64
PACKAGE_XML="$SDK_DIR/$(printf '%s' "$IMAGE" | tr ';' '/')/package.xml"

# emulator-runner accepts the licences the same way, in its own step, after this one.
(yes 2>/dev/null | "$SDKMANAGER" --licenses >/dev/null 2>&1) || true

attempt=1
while :; do
  echo "android-system-image: installing $IMAGE (attempt $attempt of $ATTEMPTS)"
  set +e
  "$SDKMANAGER" --install "$IMAGE" --channel=0 </dev/null
  status=$?
  set -e
  if [ "$status" -eq 0 ] && [ -f "$PACKAGE_XML" ]; then
    echo "android-system-image: $IMAGE is installed"
    exit 0
  fi
  echo "android-system-image: attempt $attempt failed (sdkmanager exit $status, package.xml $([ -f "$PACKAGE_XML" ] && echo present || echo missing))"
  if [ "$attempt" -ge "$ATTEMPTS" ]; then
    die "$IMAGE could not be installed after $ATTEMPTS attempts."
  fi
  attempt=$((attempt + 1))
  sleep "$DELAY"
done
