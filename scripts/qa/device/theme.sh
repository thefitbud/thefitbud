#!/usr/bin/env bash
#
# Switches the device's system appearance (Z12-35, prompt §2 Z12-35 step 2).
#
#   scripts/qa/device/theme.sh ios light|dark
#   scripts/qa/device/theme.sh android light|dark
#
# iOS:     xcrun simctl ui <udid> appearance light|dark
# Android: adb shell cmd uimode night no|yes
# The value is read back and the script fails when it did not stick. Decision 6 of
# the W12 prompt: the app follows the system theme, with no in-app switch, so this is
# the only theme control the gate needs.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="$(device_platform "${1:-}")"
THEME="${2:-}"
case "$THEME" in
  light | dark) ;;
  *) device_die "usage: theme.sh ios|android light|dark" ;;
esac

case "$PLATFORM" in
  ios)
    udid="$(device_udid)"
    xcrun simctl ui "$udid" appearance "$THEME"
    now="$(xcrun simctl ui "$udid" appearance | tr -d '[:space:]')"
    ;;
  android)
    if [ "$THEME" = "dark" ]; then night=yes; else night=no; fi
    adb shell cmd uimode night "$night" >/dev/null
    # "Night mode: yes" / "Night mode: no"
    case "$(adb shell cmd uimode night | tr -d '\r')" in
      *": yes"*) now=dark ;;
      *": no"*) now=light ;;
      *) now=unknown ;;
    esac
    ;;
esac

[ "$now" = "$THEME" ] || device_die "asked for $THEME, the $PLATFORM device reports \"$now\"."
device_log "$PLATFORM appearance is $THEME"
