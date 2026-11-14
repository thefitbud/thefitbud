#!/usr/bin/env bash
#
# Shared helpers for the device gate (Z12-35). Sourced, never run.
#
# Every script here runs on the GitHub-hosted runners of .github/workflows/device.yml:
# ubuntu-latest (Android emulator, GNU tools, bash 5) and macos-15 (iOS simulator, BSD
# tools, bash 3.2). So: no mapfile/readarray, no associative arrays, no ${var,,}, no
# GNU-only flags, and `find ... | sort | sed -n 1p` rather than `| head` (pipefail).
#
# Environment shared by every script (all optional, defaults in brackets):
#   DEVICE_PLATFORM    ios | android            (the script's first argument wins)
#   DEVICE_UDID        the booted iOS simulator  [the one ios-sim.sh boot wrote]
#   DEVICE_RESULTS     results root               [<repo>/qa-results/device]
#   DEVICE_API_PORT    local API port             [8787]
#   DEVICE_APP_ID      app id on both platforms   [com.thefitbud.mobile.staging]
#
# Secrets: none. Nothing here reads a secret; the only credential is the public demo
# seed password, read from apps/api/src/seed/demo/spec.ts (see demo_password).

DEVICE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVICE_ROOT="$(cd "$DEVICE_LIB_DIR/../../.." && pwd)"
DEVICE_RESULTS="${DEVICE_RESULTS:-$DEVICE_ROOT/qa-results/device}"
DEVICE_API_PORT="${DEVICE_API_PORT:-8787}"
DEVICE_APP_ID="${DEVICE_APP_ID:-com.thefitbud.mobile.staging}"
DEVICE_UDID_FILE="$DEVICE_RESULTS/ios-udid"

device_log() {
  echo "device[$(basename "$0" .sh)]: $*"
}

device_die() {
  echo "device[$(basename "$0" .sh)]: $*" >&2
  exit 1
}

# GitHub annotations only on a runner; plain text elsewhere.
device_warn() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::warning title=Device gate::$*"
  else
    echo "device[$(basename "$0" .sh)]: WARNING $*" >&2
  fi
}

device_require() {
  local tool
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || device_die "$tool is not installed."
  done
}

# device_platform <arg>: the explicit argument, else DEVICE_PLATFORM. ios | android.
device_platform() {
  local p="${1:-${DEVICE_PLATFORM:-}}"
  case "$p" in
    ios | android) printf '%s' "$p" ;;
    *) device_die "platform must be ios or android, not \"$p\"." ;;
  esac
}

# The booted simulator: DEVICE_UDID, else what ios-sim.sh boot recorded.
device_udid() {
  if [ -n "${DEVICE_UDID:-}" ]; then
    printf '%s' "$DEVICE_UDID"
  elif [ -f "$DEVICE_UDID_FILE" ]; then
    tr -d '[:space:]' <"$DEVICE_UDID_FILE"
  else
    device_die "no simulator: set DEVICE_UDID or run scripts/qa/device/ios-sim.sh boot first."
  fi
}

# The API base URL as the app on <platform> reaches the runner's local API. The
# Android emulator reaches the host's loopback at 10.0.2.2; the iOS simulator shares
# the Mac's network stack, so 127.0.0.1 is the Mac itself.
device_api_url_for() {
  case "$1" in
    ios) printf 'http://127.0.0.1:%s' "$DEVICE_API_PORT" ;;
    android) printf 'http://10.0.2.2:%s' "$DEVICE_API_PORT" ;;
    *) device_die "unknown platform \"$1\"." ;;
  esac
}

# The local API as the runner itself reaches it.
device_api_url() {
  printf 'http://127.0.0.1:%s' "$DEVICE_API_PORT"
}

# The demo seed password. It is public (AGENTS.md, docs/LOCAL_TESTING.md) and lives in
# one place in the code, so it is read from there rather than written down again.
demo_password() {
  local spec="$DEVICE_ROOT/apps/api/src/seed/demo/spec.ts" value
  value="$(sed -n 's/^export const DEMO_PASSWORD_PLAINTEXT = "\(.*\)";$/\1/p' "$spec")"
  [ -n "$value" ] || device_die "could not read DEMO_PASSWORD_PLAINTEXT from $spec."
  printf '%s' "$value"
}

# device_shot_name <screen or step> <theme> <platform> -> "<screen>-<theme>-<platform>.png"
device_shot_name() {
  printf '%s-%s-%s.png' "$1" "$2" "$3"
}
