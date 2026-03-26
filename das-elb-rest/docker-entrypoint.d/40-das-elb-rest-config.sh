#!/bin/sh
set -eu

API_BASE_URL="${VITE_API_URL:-}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__DAS_ELB_REST_CONFIG__ = Object.freeze({
  API_BASE_URL: "${API_BASE_URL}"
});
EOF
