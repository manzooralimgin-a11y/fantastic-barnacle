#!/usr/bin/env bash
set -euo pipefail

environment="${1:-${DEPLOY_ENVIRONMENT:-staging}}"
provider="${DEPLOY_PROVIDER:-generic-webhook}"
release_ref="${RELEASE_REF:-${GITHUB_SHA:-unknown}}"

echo "Starting deployment"
echo "  environment: ${environment}"
echo "  provider: ${provider}"
echo "  release_ref: ${release_ref}"

trigger_hook() {
  local service_name="$1"
  local hook_url="$2"

  if [[ -z "${hook_url}" ]]; then
    echo "Skipping ${service_name}: no deploy hook configured"
    return 0
  fi

  echo "Triggering ${service_name} deployment"
  curl --fail --silent --show-error -X POST "${hook_url}"
}

case "${provider}" in
  noop)
    echo "DEPLOY_PROVIDER=noop; skipping remote deployment"
    ;;
  render|generic-webhook|webhook)
    trigger_hook "backend" "${BACKEND_DEPLOY_HOOK_URL:-}"
    trigger_hook "saas" "${SAAS_DEPLOY_HOOK_URL:-}"
    trigger_hook "hotel-site" "${HOTEL_SITE_DEPLOY_HOOK_URL:-}"
    trigger_hook "restaurant-guest" "${RESTAURANT_GUEST_DEPLOY_HOOK_URL:-}"
    ;;
  *)
    echo "Unsupported DEPLOY_PROVIDER=${provider}" >&2
    echo "Supported values: noop, render, generic-webhook, webhook" >&2
    exit 1
    ;;
esac
