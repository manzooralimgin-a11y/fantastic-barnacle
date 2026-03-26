#!/usr/bin/env bash
set -euo pipefail

check_url() {
  local name="$1"
  local url="$2"

  if [[ -z "${url}" ]]; then
    echo "Skipping ${name}: no healthcheck URL configured"
    return 0
  fi

  echo "Checking ${name}: ${url}"
  local status_code
  status_code="$(curl --silent --show-error --location --output /tmp/ci-smoke.out --write-out '%{http_code}' "${url}")"

  if [[ "${status_code}" -lt 200 || "${status_code}" -ge 400 ]]; then
    echo "${name} healthcheck failed with HTTP ${status_code}" >&2
    cat /tmp/ci-smoke.out >&2 || true
    exit 1
  fi
}

check_url "backend" "${API_HEALTHCHECK_URL:-}"
check_url "saas" "${SAAS_HEALTHCHECK_URL:-}"
check_url "hotel-site" "${HOTEL_HEALTHCHECK_URL:-}"
check_url "restaurant-guest" "${RESTAURANT_GUEST_HEALTHCHECK_URL:-}"
