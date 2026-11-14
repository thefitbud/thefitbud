#!/usr/bin/env bash
#
# Sends one push to the app on the device (Z12-35, prompt §2 Z12-35 step 4).
#
#   scripts/qa/device/push.sh ios|android <notificationType> [<domainEntityType> [<domainEntityId>]]
#
# The payload is built by push-payload.mjs in the app's real shape (pushPayloadSchema
# routing data in Expo's envelope, title "FitBud", body = the type's label). The method
# used is written to $DEVICE_RESULTS/push-<platform>.json and printed.
#
# iOS — `xcrun simctl push <udid> <bundle id> <payload.apns>`. Delivered through the
#   simulator's notification centre exactly like an APNs push: the banner (or the lock
#   screen entry) is the app's own, and a tap reaches expo-notifications' response
#   listener with the routing data, so the app's tap routing (openListener.ts) runs.
#
# Android — two methods, chosen per build, and the one used is recorded:
#   fcm-broadcast       `adb root` then `am broadcast` of a
#                       com.google.android.c2dm.intent.RECEIVE intent with the FCM data
#                       map to the app's FirebaseInstanceIdReceiver. Root (available on
#                       the google_apis emulator image) satisfies the receiver's
#                       c2dm SEND permission, and expo-notifications' messaging service
#                       shows the notification exactly as for a real FCM message. Used
#                       only when the APK carries a Firebase config (google_app_id):
#                       without one, FirebaseMessaging is not initialised and the
#                       broadcast would crash the app rather than test it.
#   shell-notification  `adb shell cmd notification post`: a notification with the same
#                       title and text on the shade and lock screen, owned by the shell,
#                       not the app. It proves the lock-screen tap mechanics only; a tap
#                       opens nothing. The CI build has no google-services.json (it is an
#                       EAS file secret, D-QA1-8, and the gate holds no secrets), so this
#                       is what runs on CI today. App routing of a real Android push stays
#                       on Firoz's device checklist (Z12-58).
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="$(device_platform "${1:-}")"
TYPE="${2:-}"
ENTITY_TYPE="${3:-}"
ENTITY_ID="${4:-}"
[ -n "$TYPE" ] || device_die "usage: push.sh ios|android <notificationType> [<domainEntityType> [<domainEntityId>]]"

mkdir -p "$DEVICE_RESULTS"
RESULT="$DEVICE_RESULTS/push-$PLATFORM.json"
payload_args=(--platform "$PLATFORM" --type "$TYPE")
[ -n "$ENTITY_TYPE" ] && payload_args+=(--entity-type "$ENTITY_TYPE")
[ -n "$ENTITY_ID" ] && payload_args+=(--entity-id "$ENTITY_ID")

record() {
  jq -n --arg platform "$PLATFORM" --arg type "$TYPE" --arg method "$1" --arg note "$2" \
    '{platform: $platform, notificationType: $type, method: $method, note: $note}' >"$RESULT"
  device_log "push $TYPE via $1: $2"
}

apk_has_firebase_config() {
  local apk sdk aapt
  apk="$(cat "$DEVICE_RESULTS/android-app-path" 2>/dev/null || true)"
  [ -n "$apk" ] && [ -f "$apk" ] || return 1
  sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
  aapt="$(find "$sdk/build-tools" -maxdepth 2 -name aapt2 -type f 2>/dev/null | sort -r | sed -n 1p || true)"
  [ -n "$aapt" ] || return 1
  "$aapt" dump resources "$apk" 2>/dev/null | grep -Fq 'string/google_app_id'
}

case "$PLATFORM" in
  ios)
    udid="$(device_udid)"
    file="$DEVICE_RESULTS/push-ios.apns"
    node "$DEVICE_LIB_DIR/push-payload.mjs" "${payload_args[@]}" >"$file"
    xcrun simctl push "$udid" "$DEVICE_APP_ID" "$file"
    record "simctl-push" "APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener"
    ;;
  android)
    data="$(node "$DEVICE_LIB_DIR/push-payload.mjs" "${payload_args[@]}")"
    title="$(printf '%s' "$data" | jq -r .title)"
    message="$(printf '%s' "$data" | jq -r .message)"
    if apk_has_firebase_config && adb root >/dev/null 2>&1; then
      adb wait-for-device
      # One quoted string for the device shell: every value is single-quoted by jq.
      extras="$(printf '%s' "$data" | jq -r 'to_entries | map("--es \(.key|@sh) \(.value|@sh)") | join(" ")')"
      adb shell "am broadcast -n $DEVICE_APP_ID/com.google.firebase.iid.FirebaseInstanceIdReceiver -a com.google.android.c2dm.intent.RECEIVE --es google.message_id gate-$(date +%s) --es message_type gcm --es from gate $extras"
      record "fcm-broadcast" "FCM data message (Expo's shape) broadcast as root to the app's FirebaseInstanceIdReceiver"
    else
      adb shell cmd notification post -S bigtext -t "'$title'" fitbud-gate "'$message'" >/dev/null
      if adb shell dumpsys notification 2>/dev/null | grep -Fq 'fitbud-gate'; then
        device_log "the shell notification is posted (dumpsys notification lists tag fitbud-gate)"
      else
        device_warn "dumpsys notification does not list the fitbud-gate notification"
      fi
      record "shell-notification" "no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing"
    fi
    ;;
esac
