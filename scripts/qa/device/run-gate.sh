#!/usr/bin/env bash
#
# Runs the W12 device gate on one platform (Z12-35, prompt §3). device.yml calls it
# once per platform, after build-app.sh and with the local API serving.
#
#   scripts/qa/device/run-gate.sh ios       # macOS, booted simulator (ios-sim.sh boot)
#   scripts/qa/device/run-gate.sh android   # a booted emulator on adb
#
# Environment (all optional):
#   DEVICE_FLOWS    comma-separated Maestro tags and/or path globs under apps/mobile/.maestro
#                   (select-flows.mjs: union, in path order). Default: launch
#   DEVICE_ROLES    keep only flows tagged with one of these roles (trainee,trainer,dual)
#   DEVICE_THEMES   "light dark" (default), "light" or "dark"
#   DEVICE_EXTRAS   all (default): after the flows, the push, lock-screen and offline
#                   samples; none: flows and logs only
#
# What it does, per platform:
#   1. installs the built app, checks the local API answers;
#   2. starts the device log stream (logs.sh);
#   3. for each theme: switches the system theme (theme.sh), runs the selected Maestro
#      flows signed in as the local demo personas, renames their screenshots to
#      <screen ID>-<theme>-<platform>.png (collect-shots.mjs);
#   4. extras, once, in the last theme: a push and a lock-screen tap on it
#      (lockscreen-tap.sh, which uses push.sh), a lock-screen Live Activity tap attempt,
#      and an offline -> online round trip (network.sh) with a screenshot of each state;
#   5. stops the log stream and scans it (scan-logs.mjs);
#   Android only: before the install, before each theme and before a retry it waits for
#   a steady adb link (android_wait_stable in lib.sh); a flow that failed on that link
#   (infra-retry.mjs: "Unknown error" or adb "device not found" within 15 s, no app step
#   completed, no app crash in the log, a clean-install flow) runs once more, and the
#   summary lists every retry and its outcome;
#   6. writes summary.json / summary.md (gate-summary.mjs) and exits 1 when a flow
#      failed or the log shows a crash, red box, LogBox, console.error/warn or a React
#      warning.
#
# Results: $DEVICE_RESULTS/<platform>/ (junit, Maestro output, scan, summary, extras),
# $DEVICE_RESULTS/shots/ (screenshots) and $DEVICE_RESULTS/logs/ (device logs).
#
# Personas: the local demo seed's (docs/LOCAL_TESTING.md), passed to the flows under the
# variable names the flows already use: QA_TRAINER_EMAIL rahul.coach, QA_ONTRACK_EMAIL
# aarav.ontrack, QA_SLIPPING_EMAIL rohan.slipping, QA_DUAL_EMAIL karan.dual, QA_PASSWORD
# the public demo password. The local API has no fixed sign-in code (that is a
# staging-only QA switch), so a flow that signs in with a code fails here until it reads
# the code from the local dev mail sink (GET /dev/mail).
set -uo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="$(device_platform "${1:-}")"
FLOWS="${DEVICE_FLOWS:-launch}"
ROLES="${DEVICE_ROLES:-}"
THEMES="${DEVICE_THEMES:-light dark}"
EXTRAS="${DEVICE_EXTRAS:-all}"
OUT="$DEVICE_RESULTS/$PLATFORM"
SHOTS="$DEVICE_RESULTS/shots"
LOG_NAME="$PLATFORM-device"
export DEVICE_SHOTS_DIR="$SHOTS"

device_require maestro node jq
case "$PLATFORM" in
  ios) device_require xcrun plutil ;;
  android) device_require adb ;;
esac
rm -rf "$OUT"
mkdir -p "$OUT/extras" "$SHOTS" "$DEVICE_RESULTS/logs"
# How the app was built (full native build or native-cache hit), for the summary.
if [ -f "$DEVICE_RESULTS/build-$PLATFORM.json" ]; then cp "$DEVICE_RESULTS/build-$PLATFORM.json" "$OUT/extras/build.json"; fi

# Android: wait for a steady adb link and keep a record for the summary (extras/adb.json).
ADB_WAITS=()
ADB_UNSTEADY=0
adb_wait() {
  local what="$1" out
  if out="$(android_wait_stable)"; then
    device_log "adb link before $what: $out"
  else
    ADB_UNSTEADY=1
    device_warn "adb link before $what: $out"
  fi
  ADB_WAITS+=("$what: $out")
}

# --- 1. app and API -------------------------------------------------------------
APP="$(cat "$DEVICE_RESULTS/$PLATFORM-app-path" 2>/dev/null || true)"
[ -n "$APP" ] && [ -e "$APP" ] || device_die "no built app recorded in $DEVICE_RESULTS/$PLATFORM-app-path; run build-app.sh $PLATFORM first."

case "$PLATFORM" in
  ios)
    UDID="$(device_udid)"
    export DEVICE_UDID="$UDID"
    xcrun simctl bootstatus "$UDID" -b >/dev/null
    xcrun simctl install "$UDID" "$APP" || device_die "simctl install failed."
    MAESTRO=(maestro --device "$UDID")
    ;;
  android)
    adb wait-for-device
    # shellcheck disable=SC2016  # runs on the device
    adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
    adb_wait "boot"
    # shellcheck source=../android-emulator-prep.sh
    source "$DEVICE_ROOT/scripts/qa/android-emulator-prep.sh"
    suppress_emulator_error_dialogs || device_warn "could not hide emulator error dialogs"
    if ! adb install -r -d "$APP" >/dev/null; then
      device_warn "adb install failed once; waiting for a steady adb link and trying again"
      adb_wait "install retry"
      adb install -r -d "$APP" >/dev/null || device_die "adb install failed."
    fi
    adb shell pm path "$DEVICE_APP_ID" >/dev/null 2>&1 || device_die "$DEVICE_APP_ID is not installed after adb install."
    MAESTRO=(maestro)
    ;;
esac
"$DEVICE_LIB_DIR/local-api.sh" wait || device_die "the local API is not serving."
device_log "maestro $(maestro --version 2>/dev/null | tail -n 1)"

# iOS: Maestro drives the simulator through an XCTest runner it installs on first use.
# On a busy macos-15 runner that first start overran Maestro's default timeout ("iOS
# driver not ready in time"), and the next invocation then found the device
# "unreachable" (run 43610441275). Give it longer and start it once, with retries,
# before any flow, so a slow driver start is not reported as a flow failure.
if [ "$PLATFORM" = "ios" ]; then
  export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-300000}"
  xcrun simctl launch "$UDID" "$DEVICE_APP_ID" >/dev/null 2>&1 || true
  warmed=0
  for attempt in 1 2 3; do
    if "${MAESTRO[@]}" hierarchy >"$OUT/maestro-warmup.log" 2>&1; then
      warmed=1
      device_log "Maestro's iOS driver is up (attempt $attempt)"
      break
    fi
    device_warn "Maestro's iOS driver did not start (attempt $attempt); see $OUT/maestro-warmup.log"
    sleep 10
  done
  [ "$warmed" = 1 ] || tail -n 20 "$OUT/maestro-warmup.log"
fi

# --- flows ----------------------------------------------------------------------
node "$DEVICE_LIB_DIR/select-flows.mjs" --flows "$FLOWS" --roles "$ROLES" >"$OUT/flows.txt" \
  || device_die "no flows selected for flows=\"$FLOWS\" roles=\"$ROLES\"."
FLOW_FILES=()
while IFS= read -r f; do [ -n "$f" ] && FLOW_FILES+=("$f"); done <"$OUT/flows.txt"
device_log "${#FLOW_FILES[@]} flow(s): $(sed 's#.*/\.maestro/##' "$OUT/flows.txt" | tr '\n' ' ')"

PASSWORD="$(demo_password)"
MAESTRO_ENV=(
  -e QA_TRAINER_EMAIL=rahul.coach@demo.fitbud.test
  -e QA_ONTRACK_EMAIL=aarav.ontrack@demo.fitbud.test
  -e QA_SLIPPING_EMAIL=rohan.slipping@demo.fitbud.test
  -e QA_DUAL_EMAIL=karan.dual@demo.fitbud.test
  -e "QA_ONTRACK_NAME=Aarav Shah"
  -e "QA_SLIPPING_NAME=Rohan Mehta"
  -e "QA_PASSWORD=$PASSWORD"
  -e QA_OTP_CODE=000000
  -e "DEVICE_PLATFORM=$PLATFORM"
)

# run_maestro <theme dir> <junit file> <theme> <flow>... ; appends to <theme dir>/maestro.log
# Maestro's own output goes to <theme dir>/${MAESTRO_OUT:-maestro}.
run_maestro() {
  local dir="$1" junit="$2" theme="$3"
  shift 3
  (
    cd "$dir" && "${MAESTRO[@]}" test \
      "${MAESTRO_ENV[@]}" -e "DEVICE_THEME=$theme" \
      --format junit --output "$junit" \
      --test-output-dir "$dir/${MAESTRO_OUT:-maestro}" \
      "$@"
  ) >>"$dir/maestro.log" 2>&1
  local s=$?
  # Older Maestro builds ignore --output and write ./report.xml.
  if [ ! -f "$junit" ] && [ -f "$dir/report.xml" ]; then mv "$dir/report.xml" "$junit"; fi
  return "$s"
}

# A flow tagged device-offline runs with the device offline (network.sh).
is_offline_flow() {
  sed -n '1,/^---/p' "$1" | grep -Eq '^[[:space:]]*-[[:space:]]*device-offline[[:space:]]*$|^tags:.*device-offline'
}

# Any device-offline flow switches the run to one Maestro invocation per flow, so the
# network can change between flows. Flows then share the app's state in path order.
SEQUENTIAL=0
for f in "${FLOW_FILES[@]}"; do
  if is_offline_flow "$f"; then SEQUENTIAL=1; fi
done
[ "$SEQUENTIAL" = 1 ] && device_log "a device-offline flow is selected: running the flows one at a time, in order"

# retry_infra <theme dir> <theme> <junit> <retry junit> <log offset>: Android only. Asks
# infra-retry.mjs which failed flows of <junit> failed on the adb link (never one that
# reached the app or crashed it), runs those once more into <retry junit> after a steady
# adb link, and writes the retry's exit to <theme dir>/maestro-exit-retry. Returns 0
# only when a retry ran and passed (1 when nothing was retried).
retry_infra() {
  local dir="$1" theme="$2" junit="$3" rjunit="$4" from="$5" s
  [ "$PLATFORM" = "android" ] || return 1
  # Wait for the link first (and for the restarted logcat stream to catch up), so a crash
  # that happened during the adb drop is in the log when the retry decision reads it.
  adb_wait "retry ($theme)"
  sleep 2
  local retry_files=()
  while IFS= read -r f; do [ -n "$f" ] && retry_files+=("$f"); done < <(
    node "$DEVICE_LIB_DIR/infra-retry.mjs" --junit "$junit" --theme "$theme" \
      --log "$DEVICE_RESULTS/logs/$LOG_NAME.log" --log-from "$from" \
      --outputs "$dir/${MAESTRO_OUT:-maestro}" --out "$dir/retry.json"
  )
  [ "${#retry_files[@]}" -gt 0 ] || return 1
  device_warn "theme $theme: ${#retry_files[@]} flow(s) failed on the adb link, not in the app; running them once more: $(for f in "${retry_files[@]}"; do basename "$f"; done | tr '\n' ' ')"
  echo "--- infra retry: ${retry_files[*]}" >>"$dir/maestro.log"
  MAESTRO_OUT=maestro-retry run_maestro "$dir" "$rjunit" "$theme" "${retry_files[@]}"
  s=$?
  echo "$s" >"$dir/maestro-exit-retry"
  device_log "theme $theme: infra retry exited $s"
  return "$s"
}

# Byte size of the device log now: where this pass's part of it starts.
log_offset() {
  wc -c <"$DEVICE_RESULTS/logs/$LOG_NAME.log" 2>/dev/null | tr -d ' ' || echo 0
}

launch_app() {
  case "$PLATFORM" in
    ios) xcrun simctl launch "$UDID" "$DEVICE_APP_ID" >/dev/null 2>&1 || true ;;
    android) adb shell monkey -p "$DEVICE_APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true ;;
  esac
}

# --- 2. logs --------------------------------------------------------------------
"$DEVICE_LIB_DIR/logs.sh" "$PLATFORM" start "$LOG_NAME" || device_die "could not start the device log."

# --- 3. flows per theme ---------------------------------------------------------
last_theme=""
for theme in $THEMES; do
  last_theme="$theme"
  dir="$OUT/$theme"
  mkdir -p "$dir"
  [ "$PLATFORM" = "android" ] && adb_wait "theme $theme"
  pass_from="$(log_offset)"
  # Fresh auth rate-limit window per theme (local D1 only). Password login shares
  # one IP bucket; wrong-password F02 in dark must not inherit light's count
  # (FitBud #502).
  "$DEVICE_LIB_DIR/local-api.sh" clear-auth-rate-limits || true
  if ! "$DEVICE_LIB_DIR/theme.sh" "$PLATFORM" "$theme"; then
    echo 1 >"$dir/maestro-exit"
    continue
  fi
  device_log "theme $theme: running ${#FLOW_FILES[@]} flow(s)"
  : >"$dir/maestro.log"
  if [ "$SEQUENTIAL" = 1 ]; then
    # One invocation per flow, in path order; a device-offline flow runs offline.
    status=0
    n=0
    for flow in "${FLOW_FILES[@]}"; do
      n=$((n + 1))
      offline=0
      if is_offline_flow "$flow"; then
        offline=1
        "$DEVICE_LIB_DIR/network.sh" "$PLATFORM" offline >>"$dir/maestro.log" 2>&1 || device_warn "could not go offline before $(basename "$flow")"
      fi
      flow_from="$(log_offset)"
      run_maestro "$dir" "$dir/junit-$(printf '%02d' "$n").xml" "$theme" "$flow"
      s=$?
      if [ "$s" -ne 0 ] && retry_infra "$dir" "$theme" "$dir/junit-$(printf '%02d' "$n").xml" "$dir/junit-retry-$(printf '%02d' "$n").xml" "$flow_from"; then
        s=0
      fi
      if [ "$s" -ne 0 ]; then
        status=$s
        # What was on screen when it failed, in the job log (artifacts are not always at
        # hand for whoever reads the run).
        hier="$dir/hierarchy-$(printf '%02d' "$n").json"
        if "${MAESTRO[@]}" hierarchy >"$hier" 2>/dev/null; then
          node "$DEVICE_LIB_DIR/find-element.mjs" --format maestro --list "$hier" || true
        fi
      fi
      if [ "$offline" = 1 ]; then
        "$DEVICE_LIB_DIR/network.sh" "$PLATFORM" online >>"$dir/maestro.log" 2>&1 || device_warn "could not come back online after $(basename "$flow")"
      fi
      device_log "theme $theme: $(basename "$flow")$([ "$offline" = 1 ] && echo " (offline)") exited $s"
    done
  else
    run_maestro "$dir" "$dir/junit.xml" "$theme" "${FLOW_FILES[@]}"
    status=$?
    if [ "$status" -ne 0 ]; then
      retry_infra "$dir" "$theme" "$dir/junit.xml" "$dir/junit-retry.xml" "$pass_from" || true
    fi
  fi
  echo "$status" >"$dir/maestro-exit"
  device_log "theme $theme: maestro exited $status"
  # Maestro can echo -e values. The only one that is not an email is the demo password,
  # which is public, but it is masked anyway before the log is uploaded.
  sed "s/$PASSWORD/***/g" "$dir/maestro.log" >"$dir/maestro.log.tmp" && mv "$dir/maestro.log.tmp" "$dir/maestro.log"
  tail -n 30 "$dir/maestro.log"
  node "$DEVICE_LIB_DIR/collect-shots.mjs" --from "$dir" --to "$SHOTS" --theme "$theme" --platform "$PLATFORM" \
    >"$dir/shots.json" || device_warn "collect-shots failed for $theme"
done

# Did the app follow the system theme? Mean luminance of the flows' screenshots per
# theme (evidence in the summary, not part of the verdict).
luma_files=()
for f in "$SHOTS"/*-"$PLATFORM".png "$SHOTS"/flows/*-"$PLATFORM".png; do
  [ -f "$f" ] && luma_files+=("$f")
done
node "$DEVICE_LIB_DIR/shot-luma.mjs" --out "$OUT/extras/theme.json" ${luma_files[@]+"${luma_files[@]}"} || true

# --- 4. extras ------------------------------------------------------------------
if [ "$EXTRAS" = "all" ] && [ -n "$last_theme" ]; then
  device_log "extras in $last_theme: push + lock-screen tap, Live Activity tap, offline/online"
  launch_app
  sleep 5
  "$DEVICE_LIB_DIR/lockscreen-tap.sh" "$PLATFORM" "$last_theme" notification "FitBud" daily_summary \
    || jq -n '{outcome: "error", note: "lockscreen-tap.sh failed; see the job log"}' >"$DEVICE_RESULTS/lockscreen-notification-$PLATFORM.json"
  "$DEVICE_LIB_DIR/lockscreen-tap.sh" "$PLATFORM" "$last_theme" live-activity "Log set [0-9]+|Skip rest|FitBud · " \
    || jq -n '{outcome: "error", note: "lockscreen-tap.sh failed; see the job log"}' >"$DEVICE_RESULTS/lockscreen-live-activity-$PLATFORM.json"
  for f in "$DEVICE_RESULTS/push-$PLATFORM.json" "$DEVICE_RESULTS"/lockscreen-*-"$PLATFORM".json; do
    [ -f "$f" ] && cp "$f" "$OUT/extras/$(basename "$f" | sed "s/-$PLATFORM\.json$/.json/")"
  done

  offline_result="ok"
  launch_app
  sleep 3
  if "$DEVICE_LIB_DIR/network.sh" "$PLATFORM" offline; then
    launch_app
    sleep 8
    "$DEVICE_LIB_DIR/screenshot.sh" "$PLATFORM" offline-app "$last_theme" >/dev/null || true
    "$DEVICE_LIB_DIR/network.sh" "$PLATFORM" online || offline_result="online-failed"
    sleep 8
    "$DEVICE_LIB_DIR/screenshot.sh" "$PLATFORM" online-app "$last_theme" >/dev/null || true
  else
    offline_result="offline-failed"
    "$DEVICE_LIB_DIR/network.sh" "$PLATFORM" online || true
  fi
  if [ "$PLATFORM" = "ios" ]; then method="local API stopped and restarted (the simulator has no airplane mode)"; else method="adb shell cmd connectivity airplane-mode enable/disable"; fi
  jq -n --arg r "$offline_result" --arg m "$method" '{result: $r, method: $m, note: "screenshots offline-app and online-app"}' >"$OUT/extras/offline.json"
fi

# --- 5. logs scan ---------------------------------------------------------------
"$DEVICE_LIB_DIR/logs.sh" "$PLATFORM" stop "$LOG_NAME" || true
log_files=("$DEVICE_RESULTS/logs/$LOG_NAME.log")
for crash in "$DEVICE_RESULTS/logs/$LOG_NAME".crash-*.ips; do [ -f "$crash" ] && log_files+=("$crash"); done
node "$DEVICE_LIB_DIR/scan-logs.mjs" --platform "$PLATFORM" --out "$OUT/scan.json" "${log_files[@]}"

# Android: the adb link record (evidence, not part of the verdict; a retry it caused is
# in the summary's "Infra retries").
if [ "$PLATFORM" = "android" ]; then
  reconnects="$(wc -l <"$DEVICE_RESULTS/logs/$LOG_NAME.reconnects" 2>/dev/null | tr -d ' ' || true)"
  reconnects="${reconnects:-0}"
  if [ "$ADB_UNSTEADY" = 1 ] || [ "$reconnects" != 0 ]; then adb_outcome="unsteady"; else adb_outcome="steady"; fi
  printf '%s\n' ${ADB_WAITS[@]+"${ADB_WAITS[@]}"} \
    | jq -R . | jq -s --arg o "$adb_outcome" --arg r "$reconnects" \
      '{outcome: $o, logcatReconnects: ($r | tonumber), waits: ., note: ("logcat stream restarted " + $r + " time(s); " + (. | join("; ")))}' \
      >"$OUT/extras/adb.json" || true
fi

# --- 6. verdict -----------------------------------------------------------------
node "$DEVICE_LIB_DIR/gate-summary.mjs" --dir "$OUT" --platform "$PLATFORM"
verdict=$?
if [ -n "${GITHUB_STEP_SUMMARY:-}" ] && [ -f "$OUT/summary.md" ]; then cat "$OUT/summary.md" >>"$GITHUB_STEP_SUMMARY"; fi
exit "$verdict"
