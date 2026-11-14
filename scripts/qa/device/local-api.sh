#!/usr/bin/env bash
#
# The local seeded API the device gate runs against (Z12-35). Never staging: the app
# is built with EXPO_PUBLIC_API_BASE_URL pointing here (build-app.sh), and nothing in
# the device gate holds a staging URL, a secret or a remote D1 command.
#
#   scripts/qa/device/local-api.sh start   # seed the local D1, then serve in the background
#   scripts/qa/device/local-api.sh serve   # serve the existing local D1 in the background
#   scripts/qa/device/local-api.sh wait    # block until /health answers and demo sign-in works
#   scripts/qa/device/local-api.sh stop    # stop the server (the D1 state is kept)
#
# `start` seeds with `pnpm db:reset` (migrations, library, demo seed), or with
# `pnpm db:reseed` when DEVICE_DB=reseed and the api package has that script (Z12-34).
# DEVICE_DB=skip serves whatever is there.
#
# The server is `wrangler dev --local --persist-to .wrangler/state`, exactly what
# `pnpm api` runs, bound to 0.0.0.0 so the Android emulator reaches it at 10.0.2.2.
# Its output goes to $DEVICE_RESULTS/logs/api.log. `stop` is also the iOS "offline"
# switch (network.sh): the simulator shares the Mac's network, so the gate takes the
# API away instead of the network.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

API_DIR="$DEVICE_ROOT/apps/api"
LOG_DIR="$DEVICE_RESULTS/logs"
API_LOG="$LOG_DIR/api.log"
PID_FILE="$DEVICE_RESULTS/api.pid"
WAIT_SECONDS="${DEVICE_API_WAIT_SECONDS:-240}"

seed() {
  local mode="${DEVICE_DB:-reset}"
  (cd "$DEVICE_ROOT" && pnpm --filter @fitbud/api setup:local)
  case "$mode" in
    skip)
      device_log "DEVICE_DB=skip: serving the existing local D1"
      ;;
    reseed)
      if jq -e '.scripts["db:reseed"]' "$API_DIR/package.json" >/dev/null 2>&1; then
        device_log "seeding with pnpm db:reseed"
        (cd "$DEVICE_ROOT" && pnpm db:reseed)
      else
        device_log "no db:reseed script yet (Z12-34); seeding with pnpm db:reset"
        (cd "$DEVICE_ROOT" && pnpm db:reset)
      fi
      ;;
    reset)
      device_log "seeding with pnpm db:reset"
      (cd "$DEVICE_ROOT" && pnpm db:reset)
      ;;
    *) device_die "DEVICE_DB must be reset, reseed or skip, not \"$mode\"." ;;
  esac
}

is_up() {
  curl -fsS --max-time 3 "$(device_api_url)/health" >/dev/null 2>&1
}

serve() {
  mkdir -p "$LOG_DIR"
  if is_up; then
    device_log "an API already answers on port $DEVICE_API_PORT"
    return 0
  fi
  device_log "starting wrangler dev on 0.0.0.0:$DEVICE_API_PORT (log: $API_LOG)"
  # Detached so it outlives this step; `setsid` where it exists (Linux) so the whole
  # process group can be stopped, plain nohup on macOS.
  local launcher=(nohup)
  if command -v setsid >/dev/null 2>&1; then launcher=(setsid nohup); fi
  (
    cd "$API_DIR"
    "${launcher[@]}" pnpm exec wrangler dev src/index.ts --local --persist-to .wrangler/state \
      --ip 0.0.0.0 --port "$DEVICE_API_PORT" >>"$API_LOG" 2>&1 </dev/null &
    echo $! >"$PID_FILE"
  )
}

wait_ready() {
  local deadline=$(( $(date +%s) + WAIT_SECONDS )) body password
  password="$(demo_password)"
  body="$(jq -cn --arg p "$password" '{identifier: "rahul.coach@demo.fitbud.test", password: $p}')"
  while :; do
    if is_up && curl -fsS --max-time 5 -H 'Content-Type: application/json' -d "$body" \
      "$(device_api_url)/auth/login" 2>/dev/null | jq -e '.data.token // .data.accessToken' >/dev/null 2>&1; then
      device_log "API ready on $(device_api_url): /health answers and the demo trainer can sign in"
      return 0
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "--- last lines of $API_LOG ---" >&2
      tail -n 40 "$API_LOG" >&2 2>/dev/null || true
      device_die "the local API was not ready after ${WAIT_SECONDS}s."
    fi
    sleep 3
  done
}

stop() {
  local pid
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE")"
    # A process group exists only when setsid started it.
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  # wrangler starts workerd as a child that can outlive its parent. This only ever
  # runs on a throwaway runner whose one wrangler is ours.
  pkill -f 'wrangler.*dev src/index.ts' 2>/dev/null || true
  pkill -f 'workerd serve' 2>/dev/null || true
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    is_up || { device_log "API stopped (port $DEVICE_API_PORT closed)"; return 0; }
    sleep 1
  done
  device_die "the API still answers on port $DEVICE_API_PORT after stop."
}

device_require curl jq pnpm
case "${1:-}" in
  start) seed; serve ;;
  serve) serve ;;
  wait) wait_ready ;;
  stop) stop ;;
  *) device_die "usage: local-api.sh start|serve|wait|stop" ;;
esac
