#!/usr/bin/env bash
#
# Takes the app offline and back online (Z12-35, prompt §2 Z12-35 step 3).
#
#   scripts/qa/device/network.sh android offline|online
#   scripts/qa/device/network.sh ios offline|online
#
# Android: real airplane mode on the emulator,
#   adb shell cmd connectivity airplane-mode enable|disable
#   read back from `settings get global airplane_mode_on`. The device loses every
#   network, exactly as on a phone, so the OS reachability signal changes too.
#
# iOS simulator: THE LOCAL API IS STOPPED, not the network. The simulator has no
#   airplane mode and shares the Mac's network stack; blocking the host or the port
#   with pf would also cut the runner's own connection to GitHub, and the Network
#   Link Conditioner is not scriptable on a hosted runner. Stopping the API
#   (local-api.sh stop) makes every FitBud request fail with "connection refused",
#   which is what the app's reachability probe sees when a phone is offline.
#   `online` restarts the same API on the same D1 state (local-api.sh serve) and
#   waits until demo sign-in works again. What this does NOT exercise on iOS: the OS
#   reachability signal (NWPathMonitor / NetInfo, Z12-57). That stays on Firoz's
#   real-phone checklist (Z12-58).
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="$(device_platform "${1:-}")"
STATE="${2:-}"
case "$STATE" in
  offline | online) ;;
  *) device_die "usage: network.sh ios|android offline|online" ;;
esac

case "$PLATFORM" in
  android)
    if [ "$STATE" = "offline" ]; then mode=enable; want=1; else mode=disable; want=0; fi
    adb shell cmd connectivity airplane-mode "$mode"
    got=""
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      got="$(adb shell settings get global airplane_mode_on | tr -d '[:space:]')"
      [ "$got" = "$want" ] && break
      sleep 1
    done
    [ "$got" = "$want" ] || device_die "airplane_mode_on is \"$got\" after airplane-mode $mode."
    device_log "android airplane mode $mode (airplane_mode_on=$got)"
    ;;
  ios)
    if [ "$STATE" = "offline" ]; then
      "$DEVICE_LIB_DIR/local-api.sh" stop
      device_log "ios offline: local API stopped (method: stop the API; see the header)"
    else
      "$DEVICE_LIB_DIR/local-api.sh" serve
      "$DEVICE_LIB_DIR/local-api.sh" wait
      device_log "ios online: local API serving again"
    fi
    ;;
esac
