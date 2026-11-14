#!/usr/bin/env bash
#
# Taps a notification or a Live Activity on the LOCK SCREEN, which Maestro cannot do
# (Z12-35; exercised for real by Z12-47 and Z12-48).
#
#   scripts/qa/device/lockscreen-tap.sh ios|android <theme> [notification|live-activity] [<match regex>] [<notificationType>]
#
#   notification   (default) sends a push first (push.sh, type default daily_summary),
#                  then locks the device and taps the entry whose text matches
#                  <match> (default "FitBud").
#   live-activity  sends nothing; locks the device and taps the element matching
#                  <match> (default "FitBud"). The app starts its Live Activity
#                  (iOS) / ongoing workout notification (Android) itself during a
#                  workout, so the caller starts a workout first. With none on screen
#                  the result is "not-found", which is correct, not an error.
#
# iOS — `idb` (fb-idb + idb_companion; device.yml installs them, best effort):
#   idb ui button HOME, idb ui button LOCK (twice if the first press leaves the screen
#   dark), `idb ui describe-all --json` (springboard elements included), find-element.mjs
#   for the entry, `idb ui tap x y`, then describe-all again to see whether the app is
#   the frontmost Application. XCUITest springboard queries would also work but need a
#   UI-test target compiled on the runner; idb needs no Xcode project.
# Android — UiAutomator: KEYCODE_HOME, KEYCODE_SLEEP, KEYCODE_WAKEUP,
#   `uiautomator dump`, find-element.mjs, `input tap` twice (the AOSP keyguard asks for
#   a second tap on a notification), then `dumpsys window` for the focused package.
#
# Screenshots: lockscreen-<target>-before and -after, as <name>-<theme>-<platform>.png.
# Result: $DEVICE_RESULTS/lockscreen-<target>-<platform>.json with
#   outcome  opened-app | tapped-no-app | not-found | unavailable
# Exit 0 for every outcome except a failure of the script itself: the caller decides
# which outcome a task requires.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="$(device_platform "${1:-}")"
THEME="${2:-light}"
TARGET="${3:-notification}"
MATCH="${4:-FitBud}"
PUSH_TYPE="${5:-daily_summary}"
case "$TARGET" in
  notification | live-activity) ;;
  *) device_die "target must be notification or live-activity, not \"$TARGET\"." ;;
esac

DUMP_DIR="$DEVICE_RESULTS/lockscreen"
RESULT="$DEVICE_RESULTS/lockscreen-$TARGET-$PLATFORM.json"
mkdir -p "$DUMP_DIR"
FIND="$DEVICE_LIB_DIR/find-element.mjs"

record() {
  jq -n --arg platform "$PLATFORM" --arg target "$TARGET" --arg outcome "$1" --arg note "$2" --arg match "$MATCH" \
    '{platform: $platform, target: $target, match: $match, outcome: $outcome, note: $note}' >"$RESULT"
  device_log "lock-screen $TARGET tap: $1 ($2)"
}

shot() {
  "$DEVICE_LIB_DIR/screenshot.sh" "$PLATFORM" "lockscreen-$TARGET-$1" "$THEME" >/dev/null || device_warn "screenshot $1 failed"
}

ios_tap() {
  local udid dump xy
  udid="$(device_udid)"
  if ! command -v idb >/dev/null 2>&1; then
    record unavailable "idb is not installed on this runner; install fb-idb and idb_companion"
    return 0
  fi
  idb connect "$udid" >/dev/null 2>&1 || true
  idb ui button --udid "$udid" HOME
  sleep 2
  if [ "$TARGET" = "notification" ]; then
    "$DEVICE_LIB_DIR/push.sh" ios "$PUSH_TYPE"
    sleep 3
  fi
  idb ui button --udid "$udid" LOCK
  sleep 3
  dump="$DUMP_DIR/ios-$TARGET-locked.json"
  idb ui describe-all --udid "$udid" --json >"$dump" 2>/dev/null || true
  if ! xy="$(node "$FIND" --format idb --match "$MATCH" "$dump")"; then
    # The first press may have turned the display off; a second press shows the lock screen.
    idb ui button --udid "$udid" LOCK
    sleep 3
    idb ui describe-all --udid "$udid" --json >"$dump" 2>/dev/null || true
    xy="$(node "$FIND" --format idb --match "$MATCH" "$dump" || true)"
  fi
  if [ -z "$xy" ]; then
    # Run 43623489626 saw only the clock and date: older notifications sit in the
    # lock screen's Notification Center, which a swipe up from mid-screen reveals.
    idb ui swipe --udid "$udid" 196 600 196 300 >/dev/null 2>&1 || true
    sleep 2
    dump="$DUMP_DIR/ios-$TARGET-locked-swiped.json"
    idb ui describe-all --udid "$udid" --json >"$dump" 2>/dev/null || true
    xy="$(node "$FIND" --format idb --match "$MATCH" "$dump" || true)"
  fi
  shot before
  if [ -z "$xy" ]; then
    record not-found "no lock-screen element matches /$MATCH/i (dump: lockscreen/$(basename "$dump"))"
    return 0
  fi
  # shellcheck disable=SC2086  # "x y"
  idb ui tap --udid "$udid" $xy
  sleep 4
  dump="$DUMP_DIR/ios-$TARGET-after.json"
  idb ui describe-all --udid "$udid" --json >"$dump" 2>/dev/null || true
  shot after
  if node "$FIND" --format idb --type Application --match "FitBud" "$dump" >/dev/null 2>&1; then
    record opened-app "tapped at $xy; the app is the frontmost Application"
  else
    record tapped-no-app "tapped at $xy; the app is not the frontmost Application (dump: lockscreen/$(basename "$dump"))"
  fi
}

# One uiautomator dump of the current screen into $1.
android_dump() {
  adb shell uiautomator dump /sdcard/gate-ui.xml >/dev/null 2>&1 || true
  adb pull /sdcard/gate-ui.xml "$1" >/dev/null 2>&1 || : >"$1"
}

android_tap() {
  local dump xy focus
  # Lock-screen notifications on, with their content (the emulator's defaults vary by
  # image; recent images can show only icons).
  adb shell settings put secure lock_screen_show_notifications 1 >/dev/null 2>&1 || true
  adb shell settings put secure lock_screen_allow_private_notifications 1 >/dev/null 2>&1 || true
  adb shell settings put secure lock_screen_show_only_unseen_notifications 0 >/dev/null 2>&1 || true
  adb shell input keyevent KEYCODE_HOME
  sleep 1
  if [ "$TARGET" = "notification" ]; then
    "$DEVICE_LIB_DIR/push.sh" android "$PUSH_TYPE"
    sleep 3
  fi
  adb shell input keyevent KEYCODE_SLEEP
  sleep 2
  adb shell input keyevent KEYCODE_WAKEUP
  sleep 3
  dump="$DUMP_DIR/android-$TARGET-locked.xml"
  android_dump "$dump"
  shot before
  if ! xy="$(node "$FIND" --format uiautomator --match "$MATCH" "$dump")"; then
    # Not on the lock screen itself: pull the notification shade down over the keyguard.
    adb shell cmd statusbar expand-notifications >/dev/null 2>&1 || true
    sleep 2
    dump="$DUMP_DIR/android-$TARGET-locked-shade.xml"
    android_dump "$dump"
    shot shade
    xy="$(node "$FIND" --format uiautomator --match "$MATCH" "$dump" || true)"
  fi
  if [ -z "$xy" ]; then
    record not-found "no lock-screen element matches /$MATCH/i, on the lock screen or in the shade over it (dumps: lockscreen/android-$TARGET-locked*.xml)"
    adb shell cmd statusbar collapse >/dev/null 2>&1 || true
    adb shell input keyevent KEYCODE_MENU >/dev/null 2>&1 || true
    return 0
  fi
  # shellcheck disable=SC2086  # "x y"
  adb shell input tap $xy
  sleep 1
  # shellcheck disable=SC2086
  adb shell input tap $xy
  sleep 4
  shot after
  focus="$(adb shell dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | tr -d '\r' || true)"
  printf '%s\n' "$focus" >"$DUMP_DIR/android-$TARGET-focus.txt"
  if printf '%s' "$focus" | grep -Fq "$DEVICE_APP_ID"; then
    record opened-app "tapped at $xy twice; $DEVICE_APP_ID has the window focus"
  else
    record tapped-no-app "tapped at $xy twice; $DEVICE_APP_ID does not have the window focus (see lockscreen/android-$TARGET-focus.txt)"
  fi
}

case "$PLATFORM" in
  ios) ios_tap ;;
  android) android_tap ;;
esac
