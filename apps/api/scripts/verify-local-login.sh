#!/usr/bin/env bash
# Verifies demo password login against a running wrangler dev API (default :8787).
set -euo pipefail
BASE_URL="${FITBUD_API_URL:-http://127.0.0.1:8787}"
PASSWORD="${FITBUD_DEMO_PASSWORD:-FitBud-demo-2026}"

login() {
  local email="$1"
  curl -sS -w "\nHTTP_STATUS:%{http_code}\n" -X POST "${BASE_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"identifier\":\"${email}\",\"password\":\"${PASSWORD}\"}"
}

echo "=== Rahul (trainer) ==="
login "rahul.coach@demo.fitbud.test"
echo ""
echo "=== Rohan (trainee slipping) ==="
login "rohan.slipping@demo.fitbud.test"
echo ""
echo "=== Meera (trainee ack) ==="
login "meera.ack@demo.fitbud.test"
