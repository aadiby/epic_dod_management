#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-localhost}"
HTTP_PORT="${2:-8080}"
HTTPS_PORT="${3:-8443}"
HEALTH_PATH="${4:-/api/health}"
MAX_RETRIES="${SMOKE_MAX_RETRIES:-5}"
RETRY_DELAY_SECONDS="${SMOKE_RETRY_DELAY_SECONDS:-2}"

CURL_TLS_FLAGS=()
if [[ "${STRICT_TLS:-0}" != "1" ]]; then
  CURL_TLS_FLAGS+=(-k)
fi

HTTP_URL="http://${HOST}:${HTTP_PORT}${HEALTH_PATH}"
HTTPS_URL="https://${HOST}:${HTTPS_PORT}${HEALTH_PATH}"

echo "Checking redirect: ${HTTP_URL}"
HEADERS="$(curl -sS -I --max-time 15 "${HTTP_URL}")"
REDIRECT_STATUS="$(printf '%s\n' "${HEADERS}" | awk 'toupper($1) ~ /^HTTP/ { code=$2 } END { print code }')"
REDIRECT_LOCATION="$(printf '%s\n' "${HEADERS}" | awk 'tolower($1) == "location:" { print $2 }' | tr -d '\r')"

if [[ "${REDIRECT_STATUS}" != "301" && "${REDIRECT_STATUS}" != "302" && "${REDIRECT_STATUS}" != "308" ]]; then
  echo "FAIL: expected redirect status (301/302/308), got ${REDIRECT_STATUS:-<none>}"
  exit 1
fi

if [[ "${REDIRECT_LOCATION}" != "${HTTPS_URL}" ]]; then
  echo "FAIL: expected redirect location ${HTTPS_URL}, got ${REDIRECT_LOCATION:-<none>}"
  exit 1
fi

echo "Checking HTTPS health: ${HTTPS_URL}"
BODY=""
ATTEMPT=1
while true; do
  if [[ ${#CURL_TLS_FLAGS[@]} -gt 0 ]]; then
    BODY="$(curl -sS "${CURL_TLS_FLAGS[@]}" --max-time 15 "${HTTPS_URL}")"
  else
    BODY="$(curl -sS --max-time 15 "${HTTPS_URL}")"
  fi

  if printf '%s\n' "${BODY}" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    break
  fi

  if [[ "${ATTEMPT}" -ge "${MAX_RETRIES}" ]]; then
    echo "FAIL: HTTPS health response does not contain status=ok after ${ATTEMPT} attempts"
    echo "Body: ${BODY}"
    exit 1
  fi

  ATTEMPT=$((ATTEMPT + 1))
  sleep "${RETRY_DELAY_SECONDS}"
done

echo "PASS: HTTPS reverse proxy smoke test passed."
