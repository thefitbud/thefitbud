#!/usr/bin/env bash
# Verifies POST /auth/login against a running wrangler dev (default :8787).
set -euo pipefail
API_BASE="${API_BASE:-http://127.0.0.1:8787}"
PASSWORD="${DEMO_PASSWORD:-FitBud-demo-2026}"

for email in rahul.coach@demo.fitbud.test rohan.slipping@demo.fitbud.test meera.ack@demo.fitbud.test; do
  echo "=== $email ==="
  curl -sS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"identifier\":\"$email\",\"password\":\"$PASSWORD\"}"
  echo
done
