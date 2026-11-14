#!/usr/bin/env bash
#
# Saves one device screenshot as <screen ID>-<theme>-<platform>.png (Z12-35, prompt
# §2 Z12-35 step 5).
#
#   scripts/qa/device/screenshot.sh ios|android <screen ID or step> <theme>
#
# Into $DEVICE_SHOTS_DIR (default $DEVICE_RESULTS/shots), which the workflow uploads
# as an artifact; copy-shots.sh copies an artifact's screen shots into
# docs/qa/W12/shots/. Maestro's own takeScreenshot files are renamed the same way by
# collect-shots.mjs. Prints the path written.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="$(device_platform "${1:-}")"
NAME="${2:-}"
THEME="${3:-}"
[ -n "$NAME" ] && [ -n "$THEME" ] || device_die "usage: screenshot.sh ios|android <screen ID> <theme>"
case "$NAME" in
  */* | *..*) device_die "the screenshot name must be a plain name, not \"$NAME\"." ;;
esac

SHOTS="${DEVICE_SHOTS_DIR:-$DEVICE_RESULTS/shots}"
mkdir -p "$SHOTS"
OUT="$SHOTS/$(device_shot_name "$NAME" "$THEME" "$PLATFORM")"

case "$PLATFORM" in
  ios) xcrun simctl io "$(device_udid)" screenshot --type=png "$OUT" >/dev/null 2>&1 ;;
  android) adb exec-out screencap -p >"$OUT" ;;
esac
[ -s "$OUT" ] || device_die "the screenshot $OUT is empty."
printf '%s\n' "$OUT"
