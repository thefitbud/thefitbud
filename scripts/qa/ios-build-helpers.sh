#!/usr/bin/env bash
#
# Helpers for build-ios-sim.sh (Z5-5). Sourced, not run. The diagnosis for both
# helpers is on the Z5-5 pull request (#241).
#
# resolve_sentry_cli <apps/mobile dir>
#   Prints the absolute path of the sentry-cli executable that @sentry/react-native
#   itself depends on. @sentry/react-native's Xcode phases (sentry-xcode.sh, the
#   "Bundle React Native code and images" phase, and sentry-xcode-debug-files.sh,
#   "Upload Debug Symbols to Sentry") run
#     require.resolve('@sentry/cli/package.json')
#   from apps/mobile/ios under `set -e`, BEFORE they look at
#   SENTRY_DISABLE_AUTO_UPLOAD. pnpm's isolated layout links @sentry/cli only next
#   to @sentry/react-native under node_modules/.pnpm, so that resolve throws and
#   both phases fail the Release build (nightly 41945300332, xcodebuild exit 65).
#   Both scripts skip the resolve when SENTRY_CLI_EXECUTABLE is set, so the caller
#   exports this path. The upload itself stays off (app.config.js bakes
#   SENTRY_DISABLE_AUTO_UPLOAD=true into every non-production variant).
#
# pod_install_with_retry
#   Runs `pod install` in the current directory. CocoaPods 1.17 under pnpm symlinks
#   sometimes dies with "ArgumentError - pathname contains null byte" while
#   generating the Pods project (run 41960026903; the same tree installed cleanly
#   30 minutes earlier; CocoaPods#12798). That one signature is retried once. Any
#   other failure, or a second null-byte failure, is returned as is.

IOS_BUILD_NULL_BYTE_SIGNATURE="pathname contains null byte"

resolve_sentry_cli() {
  local mobile="$1" cli
  if [ -z "${mobile:-}" ] || [ ! -d "$mobile" ]; then
    echo "ios-build-helpers: resolve_sentry_cli needs the apps/mobile directory" >&2
    return 1
  fi
  cli="$(cd "$mobile" && node --print "
    const path = require('path');
    const rn = path.dirname(require.resolve('@sentry/react-native/package.json'));
    path.join(path.dirname(require.resolve('@sentry/cli/package.json', { paths: [rn] })), 'bin', 'sentry-cli');
  " 2>/dev/null)" || {
    echo "ios-build-helpers: @sentry/cli is not resolvable from @sentry/react-native under $mobile" >&2
    return 1
  }
  if [ ! -x "$cli" ]; then
    echo "ios-build-helpers: $cli is not an executable sentry-cli" >&2
    return 1
  fi
  printf '%s\n' "$cli"
}

pod_install_with_retry() {
  local log status attempt
  log="$(mktemp)"
  for attempt in 1 2; do
    set +e
    pod install 2>&1 | tee "$log"
    status="${PIPESTATUS[0]}"
    set -e
    if [ "$status" -eq 0 ]; then
      rm -f "$log"
      return 0
    fi
    if [ "$attempt" -eq 1 ] && grep -Fq "$IOS_BUILD_NULL_BYTE_SIGNATURE" "$log"; then
      echo "ios-build-helpers: pod install hit \"$IOS_BUILD_NULL_BYTE_SIGNATURE\" (CocoaPods#12798); retrying once"
      continue
    fi
    break
  done
  rm -f "$log"
  return "$status"
}
