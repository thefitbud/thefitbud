#!/usr/bin/env bash
#
# Ad-hoc sign a simulator .app so SecureStore can use the keychain (CU25).
# Sourced by build-ios-sim.sh, or run as:
#
#   scripts/qa/sign-ios-simulator-app.sh <app> <bundle-id>
#
# The xcodebuild step keeps CODE_SIGNING_ALLOWED=NO: the runner has no signing
# certificate, and the app's push and App Group entitlements would make a
# normal signature demand one. That leaves a binary with no keychain identity.
# Every launch in run 41784737040 then logged errSecMissingEntitlement
# (-34018) and the app showed "Can't reach FitBud" instead of sign-in.
# `codesign -s -` is an ad-hoc signature. It needs no certificate and no
# secret. Nested bundles are signed first; signing them afterwards would
# invalidate the outer signature.
SIGN_IOS_SIMULATOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sign_ios_simulator_app() {
  local app="$1"
  local bundle_id="$2"
  local entitlements nested dumped
  if [ -z "${app:-}" ] || [ -z "${bundle_id:-}" ]; then
    echo "sign-ios-simulator-app: app path and bundle id are required" >&2
    return 1
  fi
  if [ ! -d "$app" ]; then
    echo "sign-ios-simulator-app: no app at $app" >&2
    return 1
  fi
  case "$bundle_id" in
    *[!A-Za-z0-9.-]* | "" | [.-]*)
      echo "sign-ios-simulator-app: bundle id must be a reverse-DNS identifier" >&2
      return 1
      ;;
  esac

  entitlements="$(mktemp)"
  node "$SIGN_IOS_SIMULATOR_DIR/simulator-keychain-entitlements.mjs" "$bundle_id" >"$entitlements" || {
    rm -f "$entitlements"
    return 1
  }

  # Deepest path first so a framework inside another bundle is signed before
  # the bundle that contains it.
  while IFS= read -r nested; do
    [ -n "$nested" ] || continue
    codesign --force --sign - "$nested" || {
      rm -f "$entitlements"
      return 1
    }
  done < <(find "$app" -depth -type d \( -name '*.framework' -o -name '*.appex' \))

  # --generate-entitlement-der writes the DER blob the simulator actually
  # enforces. The XML plist alone is not enough on the Xcode 16 runtime.
  codesign --force --sign - --entitlements "$entitlements" --generate-entitlement-der "$app" || {
    rm -f "$entitlements"
    return 1
  }

  dumped="$(codesign -d --entitlements :- "$app" 2>&1)" || {
    rm -f "$entitlements"
    echo "sign-ios-simulator-app: codesign could not read the signature back" >&2
    return 1
  }
  rm -f "$entitlements"

  # A pipe into `grep -q` under `pipefail` (this script's caller sets it) can
  # fail with SIGPIPE even when the key is present. A here-string does not.
  if ! grep -q -F '<key>keychain-access-groups</key>' <<<"$dumped"; then
    echo "sign-ios-simulator-app: signed app has no keychain-access-groups entitlement" >&2
    return 1
  fi
  if ! grep -q -F '<key>application-identifier</key>' <<<"$dumped"; then
    echo "sign-ios-simulator-app: signed app has no application-identifier entitlement" >&2
    return 1
  fi
  if ! grep -q -F "<string>${bundle_id}</string>" <<<"$dumped"; then
    echo "sign-ios-simulator-app: signed identifier is not ${bundle_id}" >&2
    return 1
  fi
  echo "sign-ios-simulator-app: ad-hoc signed $(basename "$app") as $bundle_id"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  sign_ios_simulator_app "${1:-}" "${2:-}"
fi
