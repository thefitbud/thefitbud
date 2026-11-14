#!/usr/bin/env bash
#
# Copies a device-gate run's screen screenshots into the repository (Z12-35).
#
#   scripts/qa/device/copy-shots.sh <downloaded artifact dir> [<destination>]
#
# Download the run's `device-<platform>` artifacts first, for example:
#   gh run download <run id> --repo thefitbud/thefitbud --pattern 'device-*' --dir /tmp/device-run
#   scripts/qa/device/copy-shots.sh /tmp/device-run                 # -> docs/qa/W12/shots/
#   scripts/qa/device/copy-shots.sh /tmp/device-run docs/qa/Z12-44  # a task's own folder
#
# Only files named <screen ID>-<light|dark>-<ios|android>.png are copied (the screens the
# parity matrix points at); harness evidence such as lockscreen-*.png and the older
# flows' screenshots under shots/flows/ stay in the artifact. An existing file is
# replaced. Prints each file copied.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SRC="${1:-}"
DEST="${2:-$DEVICE_ROOT/docs/qa/W12/shots}"
[ -n "$SRC" ] && [ -d "$SRC" ] || device_die "usage: copy-shots.sh <downloaded artifact dir> [<destination>]"
mkdir -p "$DEST"

count=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  cp "$file" "$DEST/$(basename "$file")"
  echo "$DEST/$(basename "$file")"
  count=$((count + 1))
done < <(find "$SRC" -type f -name '*.png' -not -path '*/flows/*' | grep -E '/[A-Z]+-[0-9][0-9a-z]*-(light|dark)-(ios|android)\.png$' | sort)

device_log "copied $count screen screenshot(s) to $DEST"
