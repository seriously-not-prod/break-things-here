#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8081}"

check() {
  local name="$1"
  local url="$2"
  local expected_prefix="$3"

  local response
  response="$(curl -sS "$url")"
  if [[ "$response" == $expected_prefix* ]]; then
    echo "[PASS] $name"
  else
    echo "[FAIL] $name"
    echo "  URL: $url"
    echo "  Response: $response"
    exit 1
  fi
}

check "Entra config endpoint" "${BASE_URL}/api/auth/entra/config" "{"
check "CSRF token endpoint" "${BASE_URL}/api/csrf-token" "{"
check "Entra SPA init endpoint" "${BASE_URL}/api/auth/entra/init-spa" "{"

echo "All auth smoke checks passed."
