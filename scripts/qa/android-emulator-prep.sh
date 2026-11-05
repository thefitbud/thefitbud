#!/usr/bin/env bash
#
# Prepare a booted Android emulator before the Maestro flows (CU25).
# Sourced by run-maestro.sh.
#
# On the API 34 image the Pixel Launcher ANRs, and its "isn't responding"
# dialog becomes the top window. Maestro only reads that window, so
# "Sign in with a code instead" is reported not visible while the auth screen
# is rendered behind the dialog (run 41784737040, every smoke flow). The same
# screen with no dialog passes (run 41787562558).
#
# `hide_error_dialogs` is Android's own switch: 0 shows crash and ANR
# dialogs, 1 hides them. An app that actually crashes is still in logcat,
# which is what the crash scan reads. The setting is read back: a value that
# did not stick would let every flow fail the same way and look like an app
# defect.

suppress_emulator_error_dialogs() {
  local hidden
  adb shell settings put global hide_error_dialogs 1 || return 1
  hidden="$(adb shell settings get global hide_error_dialogs | tr -d '[:space:]')"
  if [ "$hidden" != "1" ]; then
    echo "android-emulator-prep: hide_error_dialogs is '${hidden}', not 1. The Pixel Launcher ANR dialog would cover the auth screen and every flow would fail its first step." >&2
    return 1
  fi
  echo "android-emulator-prep: hide_error_dialogs=1"
}
