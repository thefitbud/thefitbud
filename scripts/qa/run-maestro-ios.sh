#!/usr/bin/env bash
#
# Runs the Maestro suite on a booted iOS simulator (W3b · CU19, D-W3b-14).
#
#   scripts/qa/run-maestro-ios.sh
#
# The Android twin, scripts/qa/run-maestro.sh, stays Android-only and unchanged.
# Both run the SAME flows from apps/mobile/.maestro: the staging bundle identifier
# is the same on both platforms (apps/mobile/app.config.js), so no flow needs a
# per-platform appId, and the few genuinely platform-specific steps branch inside
# the flow with `runFlow: { when: { platform: ... } }` rather than forking a file.
#
# Installs the simulator .app, runs the flows QT3 owns with the requested tag
# filter, and captures the simulator's log for the app process. Exits with
# Maestro's own exit code: a failed flow must never be swallowed, because a
# swallowed failure plus an empty report reads as a green run with no coverage.
#
# Environment:
#   QA_MAESTRO_TAG     smoke | full (default: full). Passed as --include-tags.
#   QA_IOS_UDID        the booted simulator to drive. Required: "booted" would be
#                      ambiguous on a runner that has more than one device up, and
#                      the workflow creates exactly one on purpose.
#   QA_IOS_APP_DIR     directory holding the built .app
#                      (default: qa-results/mobile-build/ios)
#   QA_RESULTS_DIR     results root (default: <repo>/qa-results)
#   QA_TEST_OTP_CODE   staging test-mode login code (QT1). Required.
#   FITBUD_QA_PASSWORD QA account password (QT2). Required.
#   QA_MAESTRO_SKIP_INSTALL=1   use the app already on the simulator.
#
# Secret values are passed to Maestro with -e and are never printed: the one line
# this script logs names variables only. The flows take no screenshot while the
# login code is on screen (D-QA1-14).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="$ROOT/apps/mobile/.maestro"
EXPECTATIONS="$ROOT/apps/api/src/seed/qa/expectations.json"
TAG="${QA_MAESTRO_TAG:-full}"
APP_DIR="${QA_IOS_APP_DIR:-$ROOT/qa-results/mobile-build/ios}"
RESULTS_ROOT="${QA_RESULTS_DIR:-$ROOT/qa-results}"
IOS_RESULTS="$RESULTS_ROOT/ios"
LOGS_DIR="$RESULTS_ROOT/logs"
SIM_LOG="$LOGS_DIR/ios-sim.log"

die() {
  echo "run-maestro-ios: $1" >&2
  exit 1
}

case "$TAG" in
  smoke | full) ;;
  *) die "QA_MAESTRO_TAG must be smoke or full, not \"$TAG\"." ;;
esac

[ "$(uname -s)" = "Darwin" ] || die "this script only runs on macOS; an iOS simulator is required."

for tool in maestro xcrun jq plutil; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed."
done

UDID="${QA_IOS_UDID:-}"
[ -n "$UDID" ] || die "QA_IOS_UDID is not set; the workflow creates the simulator and passes its udid."

# Both QA secrets must be present before a single flow starts (see run-maestro.sh).
missing=""
[ -n "${QA_TEST_OTP_CODE:-}" ] || missing="$missing QA_TEST_OTP_CODE"
[ -n "${FITBUD_QA_PASSWORD:-}" ] || missing="$missing FITBUD_QA_PASSWORD"
[ -z "$missing" ] || die "missing required environment variable(s):$missing (names only; never log the value)."

[ -f "$EXPECTATIONS" ] || die "$EXPECTATIONS is missing; QT2's committed expectations hold the QA account emails."
[ -d "$WORKSPACE" ] || die "$WORKSPACE is missing; QT3 owns the Maestro workspace."

# Flow order matters (QT3's README) and is asserted here for the same reason as in
# run-maestro.sh: Maestro walks the workspace in path order, and
# trainee/workout-log.yaml must run before trainer/attention.yaml resolves
# exceptions, which can close workout logging for the same client.
EXPECTED_ORDER="auth trainee trainer"
ACTUAL_ORDER="$(find "$WORKSPACE/flows" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort | tr '\n' ' ')"
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

# Piping find into head under pipefail dies with SIGPIPE (141) once head
# closes the pipe, even when a .app exists. Read the sorted list, then take
# the first. A while-read over process substitution so this runs on the
# macos-15 runner's bash 3.2, which has no array-from-stdin builtin.
apps=()
while IFS= read -r app; do
  [ -n "$app" ] && apps+=("$app")
done < <(find "$APP_DIR" -maxdepth 1 -name '*.app' -type d | sort)
APP="${apps[0]:-}"
[ -n "$APP" ] || die "no .app under $APP_DIR; run scripts/qa/build-ios-sim.sh first."
APP_EXECUTABLE="$(plutil -extract CFBundleExecutable raw "$APP/Info.plist")"
[ -n "$APP_EXECUTABLE" ] || die "$APP/Info.plist has no CFBundleExecutable."

# An unsigned app reaches the simulator and then fails every flow on the first
# step: SecureStore throws -34018 and the offline screen replaces sign-in
# (CU25). Refuse to install that app. codesign writes the entitlements to
# stdout and a note to stderr; a missing signature is a non-zero status.
IOS_ENTITLEMENTS="$(codesign -d --entitlements :- "$APP" 2>/dev/null || true)"
# Here-strings, not a pipe into `grep -q`: under pipefail a pipe can die with
# SIGPIPE even when the key is present.
grep -q -F '<key>keychain-access-groups</key>' <<<"$IOS_ENTITLEMENTS" \
  || die "the simulator app has no keychain-access-groups entitlement, so SecureStore fails with -34018 and the auth screen never appears. build-ios-sim.sh must ad-hoc sign it."
grep -q -F '<key>application-identifier</key>' <<<"$IOS_ENTITLEMENTS" \
  || die "the simulator app has no application-identifier entitlement, so the keychain refuses every read. build-ios-sim.sh must ad-hoc sign it."

xcrun simctl bootstatus "$UDID" -b

if [ "${QA_MAESTRO_SKIP_INSTALL:-0}" != "1" ]; then
  echo "run-maestro-ios: installing $(basename "$APP") on $UDID"
  xcrun simctl install "$UDID" "$APP"
fi

mkdir -p "$IOS_RESULTS" "$LOGS_DIR"

# The simulator's unified log for the app process only, streamed to a file for the
# whole run. summarize.mjs scans it for a red box, a Hermes RangeError or a native
# crash and fails the ios suite on one even when every flow passed, exactly as it
# does with logs/logcat.log on Android.
: >"$SIM_LOG"
xcrun simctl spawn "$UDID" log stream --style compact --level debug \
  --predicate "process == \"$APP_EXECUTABLE\"" >>"$SIM_LOG" 2>&1 &
LOG_PID=$!

stop_log_stream() {
  # A failed capture must not change the exit code, which belongs to Maestro.
  # shellcheck disable=SC2317  # called from the EXIT trap below
  kill "$LOG_PID" 2>/dev/null || true
  # shellcheck disable=SC2317
  wait "$LOG_PID" 2>/dev/null || true
}
trap stop_log_stream EXIT

echo "run-maestro-ios: tag=$TAG udid=$UDID workspace=$WORKSPACE results=$IOS_RESULTS"

# cwd is the results directory so `--format junit` writes its report there whichever
# Maestro version is installed (older builds write ./report.xml and ignore --output).
# `set +e` only captures the status; it is re-raised below, never discarded.
set +e
(
  cd "$IOS_RESULTS" && maestro --device "$UDID" test \
    -e QA_TRAINER_EMAIL="$QA_TRAINER_EMAIL" \
    -e QA_ONTRACK_EMAIL="$QA_ONTRACK_EMAIL" \
    -e QA_SLIPPING_EMAIL="$QA_SLIPPING_EMAIL" \
    -e QA_OTP_CODE="$QA_TEST_OTP_CODE" \
    -e QA_PASSWORD="$FITBUD_QA_PASSWORD" \
    --format junit \
    --include-tags "$TAG" \
    --test-output-dir "$IOS_RESULTS" \
    "$WORKSPACE"
)
maestro_status=$?
set -e

# summarize.mjs's contract is qa-results/ios/junit.xml. Normalise whatever name this
# Maestro version chose; a missing report stays missing, and the ios suite is
# reported as `error`.
if [ ! -f "$IOS_RESULTS/junit.xml" ]; then
  # Same SIGPIPE hazard as the .app lookup above. while-read: bash 3.2
  # on macos-15 has no array-from-stdin builtin.
  reports=()
  while IFS= read -r found; do
    [ -n "$found" ] && reports+=("$found")
  done < <(find "$IOS_RESULTS" -maxdepth 2 -name '*.xml' -type f | sort)
  report="${reports[0]:-}"
  if [ -n "$report" ]; then
    mv "$report" "$IOS_RESULTS/junit.xml"
    echo "run-maestro-ios: moved $(basename "$report") to junit.xml"
  else
    echo "run-maestro-ios: no JUnit report was written; the QA report will show the ios suite as error" >&2
  fi
fi

# Say so when the capture produced nothing. summarize.mjs is the gate -- it turns
# an ios `pass` with an unusable log into `error` -- but a silent empty file is
# worth naming in the job log too, because the cause is here, not there. React
# Native logs `Running "main"` as it starts the bundle, so its absence means the
# --predicate matched no process or the stream died. The exit code is deliberately
# left alone: it belongs to Maestro.
if ! grep -qF 'Running "main"' "$SIM_LOG" 2>/dev/null; then
  echo "::warning title=Simulator log capture produced nothing::$SIM_LOG holds none of the app's own output ($(wc -l <"$SIM_LOG" 2>/dev/null || echo 0) lines), so the iOS crash scan had nothing to scan. The log stream --predicate probably did not match the app process (CFBundleExecutable is \"$APP_EXECUTABLE\")."
  echo "run-maestro-ios: WARNING $SIM_LOG shows no app output; the crash scan proved nothing" >&2
fi

echo "run-maestro-ios: maestro exited $maestro_status"
exit "$maestro_status"
