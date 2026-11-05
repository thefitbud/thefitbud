#!/usr/bin/env bash
#
# Runs the Maestro Android suite on a booted emulator (QA1 · QT7).
#
#   scripts/qa/run-maestro.sh
#
# Installs the staging-variant APK, runs the flows QT3 owns with the requested tag
# filter, and captures logcat. A failed flow keeps Maestro's exit code: a swallowed
# failure plus an empty report reads as a green run with no coverage. A Maestro pass
# whose logcat does not show the app's own output exits 1, because the crash scan
# then proved nothing.
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
# The log is one `logcat -d` taken after the whole suite. At the emulator's default
# ring-buffer size the emulator's own chatter wraps the buffers within minutes and
# evicts the app's `Running "main"` lines (run 41974112379: 4/4 flows passed, 7352
# lines, no app output; Z5-5, #241). Make the buffers big enough to hold the suite.
adb logcat -G 16M >/dev/null 2>&1 || echo "run-maestro: could not resize the logcat buffers" >&2
echo "run-maestro: logcat buffers: $(adb logcat -g 2>/dev/null | tr '\n' ' ')"
adb logcat -c || true

# QT8 scans logs/logcat.log even when every flow passed. A failed `adb logcat`
# used to write one line to stderr and leave Maestro's 0 in place, so an empty
# log (no crash found) was indistinguishable from a clean run. React Native
# logs `Running "main"` as the bundle starts; without that line the crash scan
# proved nothing. Maestro's own failure is kept. A pass with an unusable log
# fails the job, which is the conclusion this script owns.
maestro_status=1
captured_logcat=0
capture_logcat() {
  # shellcheck disable=SC2317  # called from the EXIT trap below
  if [ "$captured_logcat" = 1 ]; then
    return 0
  fi
  # shellcheck disable=SC2317
  captured_logcat=1
  # shellcheck disable=SC2317
  if ! adb logcat -d >"$LOGS_DIR/logcat.log"; then
    echo "run-maestro: logcat capture failed" >&2
  fi
  # shellcheck disable=SC2317
  echo "run-maestro: logcat.log has $(wc -l <"$LOGS_DIR/logcat.log" 2>/dev/null || echo 0) lines, $(grep -c 'ReactNativeJS' "$LOGS_DIR/logcat.log" 2>/dev/null || true) from ReactNativeJS"
  # shellcheck disable=SC2317
  if ! grep -qF 'Running "main"' "$LOGS_DIR/logcat.log" 2>/dev/null; then
    lines="$(wc -l <"$LOGS_DIR/logcat.log" 2>/dev/null || echo 0)"
    echo "::warning title=Logcat capture produced nothing::$LOGS_DIR/logcat.log holds none of the app's own output (${lines} lines), so the Android crash scan had nothing to scan."
    echo "run-maestro: WARNING logcat shows no app output; the crash scan proved nothing" >&2
    # shellcheck disable=SC2317
    if [ "$maestro_status" -eq 0 ]; then
      maestro_status=1
    fi
  fi
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
  # Piping find into head under pipefail dies with SIGPIPE (141) once head
  # closes the pipe, even when a report exists. Read the sorted list, then
  # take the first.
  mapfile -t reports < <(find "$MOBILE_RESULTS" -maxdepth 2 -name '*.xml' -type f | sort)
  report="${reports[0]:-}"
  if [ -n "$report" ]; then
    mv "$report" "$MOBILE_RESULTS/junit.xml"
    echo "run-maestro: moved $(basename "$report") to junit.xml"
  else
    echo "run-maestro: no JUnit report was written; the QA report will show the mobile suite as error" >&2
  fi
fi

capture_logcat
echo "run-maestro: maestro exited $maestro_status"
exit "$maestro_status"
