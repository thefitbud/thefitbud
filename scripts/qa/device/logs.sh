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
#          before the scan. The stream restarts after an adb transport drop and counts
#          each restart in logs/<name>.reconnects (android_stream below).
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
RECONNECTS="$LOG_DIR/$NAME.reconnects"
mkdir -p "$LOG_DIR"

ios_executable() {
  local app
  app="$(cat "$DEVICE_RESULTS/ios-app-path" 2>/dev/null || true)"
  [ -n "$app" ] && [ -d "$app" ] || device_die "no built app recorded in $DEVICE_RESULTS/ios-app-path; run build-app.sh ios first."
  plutil -extract CFBundleExecutable raw "$app/Info.plist"
}

# One `adb logcat` process ends when the emulator's adb transport drops. Runs
# 44130567993 and 44135603252 kept 17,972 and 11,489 lines (a green run of the same
# flows keeps about 120,000): the stream died at the first flow and the scan reported
# capture-empty although the app ran every later flow. So the stream is restarted after
# every drop, from the last timestamp it wrote (`-T`, inclusive: that one line can
# repeat), and each restart is counted in <name>.reconnects and marked in the log.
android_stream() {
  local since
  set +e # a dropped stream exits non-zero; this loop must outlive it
  while :; do
    timeout 60 adb wait-for-device >/dev/null 2>&1 || { sleep 2; continue; }
    since="$(tail -n 200 "$LOG" 2>/dev/null | sed -n 's/^\([0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]\.[0-9][0-9][0-9]\).*/\1/p' | tail -n 1)"
    if [ -n "$since" ]; then
      adb logcat -v threadtime -T "$since"
    else
      adb logcat -v threadtime
    fi
    echo "--------- device[logs]: logcat stream ended at $(date -u +%H:%M:%S) UTC (adb transport dropped?); reconnecting"
    echo "$(date -u +%H:%M:%S)" >>"$RECONNECTS"
    sleep 1
  done
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
      : >"$RECONNECTS"
      android_stream >>"$LOG" 2>&1 &
      echo $! >"$PID_FILE"
      device_log "streaming logcat to $LOG"
      ;;
  esac
}

stop() {
  if [ -f "$PID_FILE" ]; then
    local pid children
    pid="$(cat "$PID_FILE")"
    # The Android stream is a restart loop: stop the loop, then the adb logcat it runs.
    children="$(pgrep -P "$pid" 2>/dev/null || true)"
    kill "$pid" 2>/dev/null || true
    for c in $children; do kill "$c" 2>/dev/null || true; done
    rm -f "$PID_FILE"
  fi
  if [ "$PLATFORM" = "android" ] && [ -s "$RECONNECTS" ]; then
    device_warn "the logcat stream ended and was restarted $(wc -l <"$RECONNECTS" | tr -d ' ') time(s) (adb transport drops; see $NAME.reconnects)"
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
