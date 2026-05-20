#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_EXAMPLE}" ]]; then
  echo "Error: ${ENV_EXAMPLE} not found"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  echo "Created .env from .env.example"
fi

set_or_replace() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    printf "%s=%s\n" "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

get_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "${ENV_FILE}" | head -1 | cut -d'=' -f2- || true)"
  printf "%s" "$value"
}

ensure_hex_secret() {
  local key="$1"
  local current
  current="$(get_value "$key")"
  if [[ -z "$current" || "$current" == change-* || "$current" == your-* ]]; then
    set_or_replace "$key" "$(openssl rand -hex 32)"
    echo "Generated ${key}"
  fi
}

ensure_base64_32b() {
  local key="$1"
  local current decoded_len
  current="$(get_value "$key")"

  if [[ -n "$current" ]]; then
    decoded_len="$(printf "%s" "$current" | base64 -d 2>/dev/null | wc -c | tr -d ' ')"
  else
    decoded_len="0"
  fi

  if [[ "$decoded_len" != "32" ]]; then
    set_or_replace "$key" "$(openssl rand -base64 32 | tr -d '\n')"
    echo "Generated ${key} (32-byte base64)"
  fi
}

ensure_hex_secret "JWT_SECRET"
ensure_hex_secret "TOKEN_HASH_SECRET"
ensure_base64_32b "REFRESH_TOKEN_ENC_KEY"

# Dev defaults for consistency across machines
set_or_replace "ENTRA_MFA_REQUIRED" "false"
set_or_replace "AZURE_PUBLIC_CLIENT" "true"

echo "Bootstrap complete."
echo "Next: docker compose up -d --build"
