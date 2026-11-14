#!/usr/bin/env bash
#
# Device log capture for the gate (Z12-35, prompt §2 Z12-35 step 6).
#
#   scripts/qa/device/logs.sh ios|android start <name>   # begin streaming to logs/<name>.log
#   scripts/qa/device/logs.sh ios|android stop  <name>   # end the stream, collect crash reports
#
# iOS:     xcrun simctl spawn <udid> log stream --style compact --level debug
#            --predicate 'process == "<CFBundleExecutable>"'
#          plus any crash report (~/Library/Logs/DiagnosticReports) the app wrote
#          after `start`, copied next to the log as <name>.crash-<n>.ips.
# Android: adb logcat -v threadtime, streamed (buffers enlarged to 16 MB and cleared
#          first, as run-maestro.sh does), so a long run cannot wrap the ring buffer
#          before the scan.
#
# scan-logs.mjs reads what this writes and fails the run on a crash, a red box, a JS
# console.error or console.warn, or a React warning. The logs are uploaded with the
# results; they hold the app's own output only on iOS, the whole emulator on Android.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="$(device_platform "${1:-}")"
ACTION="${2:-}"
NAME="${3:-device}"
LOG_DIR="$DEVICE_RESULTS/logs"
LOG="$LOG_DIR/$NAME.log"
PID_FILE="$LOG_DIR/.$NAME.pid"
MARK="$LOG_DIR/.$NAME.start"
mkdir -p "$LOG_DIR"

ios_executable() {
  local app
  app="$(cat "$DEVICE_RESULTS/ios-app-path" 2>/dev/null || true)"
  [ -n "$app" ] && [ -d "$app" ] || device_die "no built app recorded in $DEVICE_RESULTS/ios-app-path; run build-app.sh ios first."
  plutil -extract CFBundleExecutable raw "$app/Info.plist"
}

start() {
  : >"$LOG"
  : >"$MARK"
  case "$PLATFORM" in
    ios)
      local exe
      exe="$(ios_executable)"
      xcrun simctl spawn "$(device_udid)" log stream --style compact --level debug \
        --predicate "process == \"$exe\"" >>"$LOG" 2>&1 &
      echo $! >"$PID_FILE"
      device_log "streaming the simulator log for process \"$exe\" to $LOG"
      ;;
    android)
      adb logcat -G 16M >/dev/null 2>&1 || device_warn "could not resize the logcat buffers"
      adb logcat -c || true
      adb logcat -v threadtime >>"$LOG" 2>&1 &
      echo $! >"$PID_FILE"
      device_log "streaming logcat to $LOG"
      ;;
  esac
}

stop() {
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  if [ "$PLATFORM" = "ios" ] && [ -f "$MARK" ]; then
    local exe n=0 report
    exe="$(ios_executable)"
    while IFS= read -r report; do
      [ -n "$report" ] || continue
      n=$((n + 1))
      cp "$report" "$LOG_DIR/$NAME.crash-$n.ips"
      device_warn "the app wrote a crash report: $(basename "$report")"
    done < <(find "$HOME/Library/Logs/DiagnosticReports" -type f -newer "$MARK" \
      \( -name "${exe}*" -o -name "*${DEVICE_APP_ID}*" \) 2>/dev/null | sort)
  fi
  rm -f "$MARK"
  device_log "$LOG: $(wc -l <"$LOG" | tr -d ' ') lines"
}

case "$ACTION" in
  start) start ;;
  stop) stop ;;
  *) device_die "usage: logs.sh ios|android start|stop <name>" ;;
esac
