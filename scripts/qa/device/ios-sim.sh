#!/usr/bin/env bash
#
# Creates and boots the iOS simulator for the device gate (Z12-35). macOS only.
#
#   scripts/qa/device/ios-sim.sh boot      # create + boot; writes $DEVICE_RESULTS/ios-udid
#   scripts/qa/device/ios-sim.sh shutdown
#
# Toolchain. The newest Xcode this app can build with is the newest one the gate
# uses: Expo SDK 52 / React Native 0.76 does not support the Xcode 26 toolchain, so
# device.yml pins Xcode 16.4 on macos-15, as qa.yml does. The runtime is the newest
# iOS 18 runtime installed for that Xcode, unless DEVICE_IOS_RUNTIME names one.
#
# Environment (all optional):
#   DEVICE_IOS_RUNTIME      a runtime identifier, or "latest" (default): the newest
#                           available iOS runtime whose major version is
#                           DEVICE_IOS_MAJOR (default 18)
#   DEVICE_IOS_DEVICE_TYPE  default com.apple.CoreSimulator.SimDeviceType.iPhone-16
#                           (the 393x852 frame size the visual check uses)
#   DEVICE_TIME_ZONE        default Asia/Kolkata; the seed's "today" is in IST. macOS
#                           only knows the old link name Asia/Calcutta, tried second.
#   DEVICE_LOCALE           default en_IN
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ "$(uname -s)" = "Darwin" ] || device_die "the iOS simulator needs macOS."
device_require xcrun jq

RUNTIME="${DEVICE_IOS_RUNTIME:-latest}"
MAJOR="${DEVICE_IOS_MAJOR:-18}"
DEVICE_TYPE="${DEVICE_IOS_DEVICE_TYPE:-com.apple.CoreSimulator.SimDeviceType.iPhone-16}"
TIME_ZONE="${DEVICE_TIME_ZONE:-Asia/Kolkata}"
LOCALE="${DEVICE_LOCALE:-en_IN}"
SIM_NAME="device-gate-iphone"

pick_runtime() {
  if [ "$RUNTIME" != "latest" ]; then
    printf '%s' "$RUNTIME"
    return 0
  fi
  xcrun simctl list runtimes -j | jq -r --arg major "$MAJOR" '
    [.runtimes[]
      | select(.isAvailable == true and .platform == "iOS")
      | select(.version | startswith($major + "."))]
    | sort_by(.version | split(".") | map(tonumber))
    | last | .identifier // empty'
}

boot() {
  mkdir -p "$DEVICE_RESULTS"
  local runtime udid zone host_zone candidate
  runtime="$(pick_runtime)"
  [ -n "$runtime" ] || { xcrun simctl list runtimes; device_die "no available iOS $MAJOR runtime on this image (list above)."; }
  if ! xcrun simctl list devicetypes | grep -Fq "$DEVICE_TYPE"; then
    xcrun simctl list devicetypes | grep -iF iphone || true
    device_die "$DEVICE_TYPE is not on this image (list above)."
  fi
  device_log "xcode: $(xcodebuild -version | tr '\n' ' ') runtime: $runtime device: $DEVICE_TYPE"

  # The simulator takes its zone from the host (verified by qa.yml's ios job).
  host_zone=""
  for candidate in "$TIME_ZONE" Asia/Calcutta; do
    if sudo systemsetup -settimezone "$candidate" >/dev/null 2>&1; then
      host_zone="$candidate"
      break
    fi
  done
  [ -n "$host_zone" ] && device_log "host zone set as $host_zone" || device_warn "could not set the host zone to $TIME_ZONE; dates may read in UTC."

  udid="$(xcrun simctl create "$SIM_NAME" "$DEVICE_TYPE" "$runtime")"
  printf '%s\n' "$udid" >"$DEVICE_UDID_FILE"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl spawn "$udid" defaults write -g AppleLocale -string "$LOCALE"
  xcrun simctl spawn "$udid" defaults write -g AppleLanguages -array "en-IN"
  # Restart so SpringBoard picks up the locale and the zone.
  xcrun simctl shutdown "$udid"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b >/dev/null
  zone="$(xcrun simctl spawn "$udid" /bin/date +%Z | tr -d '[:space:]')"
  device_log "booted $udid; simulator zone $zone"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "udid=$udid" >>"$GITHUB_OUTPUT"; fi
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "DEVICE_UDID=$udid" >>"$GITHUB_ENV"
    echo "TZ=$TIME_ZONE" >>"$GITHUB_ENV"
  fi
}

case "${1:-}" in
  boot) boot ;;
  shutdown) xcrun simctl shutdown "$(device_udid)" || true ;;
  *) device_die "usage: ios-sim.sh boot|shutdown" ;;
esac
