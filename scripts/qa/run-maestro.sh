#!/usr/bin/env bash
#
# Runs the Maestro Android suite on a booted emulator (QA1 · QT7).
#
#   scripts/qa/run-maestro.sh
#
# Installs the staging-variant APK, runs the flows QT3 owns with the requested tag
# filter, and captures logcat. Exits with Maestro's own exit code: a failed flow must
# never be swallowed, because a swallowed failure plus an empty report reads as a
# green run with no coverage.
#
# Environment:
#   QA_MAESTRO_TAG     smoke | full (default: full). Passed as --include-tags; QT3's
#                      config.yaml documents the tags instead of naming filter sets,
#                      because a Maestro workspace config cannot hold two.
#   QA_APK_PATH        the APK to install (default: qa-results/mobile-build/app-release.apk)
#   QA_RESULTS_DIR     results root (default: <repo>/qa-results)
#   QA_TEST_OTP_CODE   staging test-mode login code (QT1). Required.
#   FITBUD_QA_PASSWORD QA account password (QT2). Required.
#   QA_MAESTRO_SKIP_INSTALL=1   use the APK already on the device.
#
# Secret values are passed to Maestro with -e and are never printed: the one line this
# script logs names variables only. The flows take no screenshot while the login code
# is on screen (D-QA1-14).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="$ROOT/apps/mobile/.maestro"
EXPECTATIONS="$ROOT/apps/api/src/seed/qa/expectations.json"
TAG="${QA_MAESTRO_TAG:-full}"
APK="${QA_APK_PATH:-$ROOT/qa-results/mobile-build/app-release.apk}"
RESULTS_ROOT="${QA_RESULTS_DIR:-$ROOT/qa-results}"
MOBILE_RESULTS="$RESULTS_ROOT/mobile"
LOGS_DIR="$RESULTS_ROOT/logs"

die() {
  echo "run-maestro: $1" >&2
  exit 1
}

case "$TAG" in
  smoke | full) ;;
  *) die "QA_MAESTRO_TAG must be smoke or full, not \"$TAG\"." ;;
esac

for tool in maestro adb jq; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed."
done

# Both QA secrets must be present before a single flow starts. A run without them
# would sign in nowhere and still produce a report (QT6/QT5 fail loudly on CI, but
# Maestro would just fail every flow with an unhelpful message).
missing=""
[ -n "${QA_TEST_OTP_CODE:-}" ] || missing="$missing QA_TEST_OTP_CODE"
[ -n "${FITBUD_QA_PASSWORD:-}" ] || missing="$missing FITBUD_QA_PASSWORD"
[ -z "$missing" ] || die "missing required environment variable(s):$missing (names only; never log the value)."

[ -f "$EXPECTATIONS" ] || die "$EXPECTATIONS is missing; QT2's committed expectations hold the QA account emails."
[ -d "$WORKSPACE" ] || die "$WORKSPACE is missing; QT3 owns the Maestro workspace."

# Flow order matters (QT3's README): trainee/workout-log.yaml must run before
# trainer/attention.yaml resolves exceptions, which can close workout logging for the
# same client. Maestro walks the workspace in path order, so the order is only correct
# while the directories sort this way. Assert it rather than assume it.
EXPECTED_ORDER="auth trainee trainer"
ACTUAL_ORDER="$(find "$WORKSPACE/flows" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | tr '\n' ' ')"
ACTUAL_ORDER="${ACTUAL_ORDER% }"
if [ "$ACTUAL_ORDER" != "$EXPECTED_ORDER" ]; then
  die "flow directories sort as \"$ACTUAL_ORDER\" but the suite needs \"$EXPECTED_ORDER\". A new flow directory changed the run order; fix the order or update this guard with QT3."
fi

read_email() {
  local key="$1" value
  value="$(jq -r --arg k "$key" '.accounts[] | select(.key == $k) | .email' "$EXPECTATIONS")"
  [ -n "$value" ] || die "expectations.json has no account with key \"$key\"."
  printf '%s' "$value"
}

QA_TRAINER_EMAIL="$(read_email trainer)"
QA_ONTRACK_EMAIL="$(read_email ontrack)"
QA_SLIPPING_EMAIL="$(read_email slipping)"

adb wait-for-device
# shellcheck disable=SC2016  # the loop runs on the device, not here
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'

# Before any flow. A Pixel Launcher ANR dialog owns the top window and Maestro
# then reports the auth screen as absent (CU25). Must run after boot, before
# `maestro test`.
# shellcheck source=android-emulator-prep.sh
source "$(dirname "${BASH_SOURCE[0]}")/android-emulator-prep.sh"
suppress_emulator_error_dialogs || die "could not hide emulator error dialogs."

if [ "${QA_MAESTRO_SKIP_INSTALL:-0}" != "1" ]; then
  [ -f "$APK" ] || die "no APK at $APK; run scripts/qa/build-android-apk.sh first."
  echo "run-maestro: installing $(basename "$APK")"
  adb install -r -d "$APK"
fi

mkdir -p "$MOBILE_RESULTS" "$LOGS_DIR"
adb logcat -c || true

capture_logcat() {
  # Always collect the device log, whatever happened to the flows: QT8 scans
  # logs/logcat.log for app crashes even when every flow passed. A failed capture must
  # not change the exit code, which belongs to Maestro.
  # shellcheck disable=SC2317  # called from the EXIT trap below
  adb logcat -d >"$LOGS_DIR/logcat.log" 2>/dev/null || echo "run-maestro: logcat capture failed" >&2
}
trap capture_logcat EXIT

echo "run-maestro: tag=$TAG workspace=$WORKSPACE results=$MOBILE_RESULTS"

# cwd is the results directory so `--format junit` writes its report there whichever
# Maestro version is installed (older builds write ./report.xml and ignore --output).
# `set +e` only captures the status; it is re-raised below, never discarded.
set +e
(
  cd "$MOBILE_RESULTS" && maestro test \
    -e QA_TRAINER_EMAIL="$QA_TRAINER_EMAIL" \
    -e QA_ONTRACK_EMAIL="$QA_ONTRACK_EMAIL" \
    -e QA_SLIPPING_EMAIL="$QA_SLIPPING_EMAIL" \
    -e QA_OTP_CODE="$QA_TEST_OTP_CODE" \
    -e QA_PASSWORD="$FITBUD_QA_PASSWORD" \
    --format junit \
    --include-tags "$TAG" \
    --test-output-dir "$MOBILE_RESULTS" \
    "$WORKSPACE"
)
maestro_status=$?
set -e

# QT8's contract is qa-results/mobile/junit.xml. Normalise whatever name this Maestro
# version chose; a missing report stays missing, and QT8 reports the suite as `error`.
if [ ! -f "$MOBILE_RESULTS/junit.xml" ]; then
  report="$(find "$MOBILE_RESULTS" -maxdepth 2 -name '*.xml' -type f | sort | head -n 1)"
  if [ -n "$report" ]; then
    mv "$report" "$MOBILE_RESULTS/junit.xml"
    echo "run-maestro: moved $(basename "$report") to junit.xml"
  else
    echo "run-maestro: no JUnit report was written; the QA report will show the mobile suite as error" >&2
  fi
fi

echo "run-maestro: maestro exited $maestro_status"
exit "$maestro_status"
