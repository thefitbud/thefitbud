#!/usr/bin/env bash
#
# Ad-hoc sign a simulator .app so it launches and SecureStore can use the
# keychain (CU25, reworked in Z5-5). Sourced by build-ios-sim.sh and
# run-maestro-ios.sh, or run as:
#
#   scripts/qa/sign-ios-simulator-app.sh <app> <bundle-id>
#
# The xcodebuild step keeps CODE_SIGNING_ALLOWED=NO: the runner has no signing
# certificate, and the app's push and App Group entitlements would make a
# normal signature demand one. An unsigned binary has no keychain identity:
# every launch in run 41784737040 logged errSecMissingEntitlement (-34018).
#
# Where the keychain entitlements live (Z5-5, #241). CU25 put
# application-identifier and keychain-access-groups into the ad-hoc code
# signature. The simulator runs the app as a host macOS process, and macOS
# kills an ad-hoc signature that carries restricted entitlements without a
# provisioning profile: every launch in run 41979502253 ended in
# "SIGKILL (Code Signature Invalid)", "Taskgated Invalid Signature". Xcode's own
# simulator builds do it differently, and so does this script now:
#   - build-ios-sim.sh has the linker embed the entitlements plist in the
#     binary's __TEXT,__entitlements section (LD_ENTITLEMENTS_SECTION). That is
#     where the simulator reads an app's entitlements from.
#   - the code signature is ad-hoc with NO entitlements (`codesign -s -`).
# Nested bundles are signed first; signing them afterwards would invalidate the
# outer signature.
SIGN_IOS_SIMULATOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Keys that macOS only accepts in a signature backed by a provisioning profile.
IOS_RESTRICTED_ENTITLEMENT_KEYS=(
  "<key>application-identifier</key>"
  "<key>keychain-access-groups</key>"
  "<key>com.apple.developer."
  "<key>aps-environment</key>"
  "<key>com.apple.security.application-groups</key>"
)

ios_app_executable() {
  local app="$1" exe
  exe="$(plutil -extract CFBundleExecutable raw "$app/Info.plist" 2>/dev/null || true)"
  [ -n "$exe" ] || exe="$(basename "$app" .app)"
  printf '%s/%s\n' "$app" "$exe"
}

# Succeeds when the app binary carries a __TEXT,__entitlements section holding
# this bundle id's application-identifier and keychain access group.
ios_embedded_entitlements_ok() {
  local app="$1" bundle_id="$2" bin sections
  bin="$(ios_app_executable "$app")"
  if [ ! -f "$bin" ]; then
    echo "sign-ios-simulator-app: no executable at $bin" >&2
    return 1
  fi
  sections="$(otool -l "$bin" 2>/dev/null || true)"
  if ! grep -q -E 'sectname __entitlements' <<<"$sections"; then
    echo "sign-ios-simulator-app: $(basename "$bin") has no __TEXT,__entitlements section; build-ios-sim.sh must pass LD_ENTITLEMENTS_SECTION" >&2
    return 1
  fi
  if ! grep -a -q -F '<key>keychain-access-groups</key>' "$bin"; then
    echo "sign-ios-simulator-app: the embedded entitlements have no keychain-access-groups" >&2
    return 1
  fi
  if ! grep -a -q -F '<key>application-identifier</key>' "$bin"; then
    echo "sign-ios-simulator-app: the embedded entitlements have no application-identifier" >&2
    return 1
  fi
  if ! grep -a -q -F "<string>${bundle_id}</string>" "$bin"; then
    echo "sign-ios-simulator-app: the embedded entitlements do not name ${bundle_id}" >&2
    return 1
  fi
}

# Succeeds when the code signature carries none of the restricted keys.
ios_signature_unrestricted() {
  local app="$1" dumped key
  dumped="$(codesign -d --entitlements :- "$app" 2>/dev/null || true)"
  for key in "${IOS_RESTRICTED_ENTITLEMENT_KEYS[@]}"; do
    if grep -q -F "$key" <<<"$dumped"; then
      echo "sign-ios-simulator-app: the code signature carries the restricted entitlement ${key}; macOS kills such an ad-hoc app at launch (Taskgated Invalid Signature)" >&2
      return 1
    fi
  done
}

sign_ios_simulator_app() {
  local app="$1"
  local bundle_id="$2"
  local nested
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

  ios_embedded_entitlements_ok "$app" "$bundle_id" || return 1

  # Deepest path first so a framework inside another bundle is signed before
  # the bundle that contains it.
  while IFS= read -r nested; do
    [ -n "$nested" ] || continue
    codesign --force --sign - "$nested" || return 1
  done < <(find "$app" -depth -type d \( -name '*.framework' -o -name '*.appex' \))

  # No --entitlements: the entitlements are in the binary, not the signature.
  codesign --force --sign - "$app" || return 1

  ios_signature_unrestricted "$app" || return 1
  echo "sign-ios-simulator-app: ad-hoc signed $(basename "$app") as $bundle_id (entitlements embedded in __TEXT,__entitlements)"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  sign_ios_simulator_app "${1:-}" "${2:-}"
fi
