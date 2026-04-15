#!/usr/bin/env bash
# =============================================================================
# Content Guard — Das Elb CI
# =============================================================================
# Scans all source files for forbidden strings that must NEVER appear in
# production code. Exits non-zero on the first category of violations found.
#
# Usage:
#   bash scripts/check-content.sh
#   bash scripts/check-content.sh --fix   # show which files to edit
#
# Run locally before pushing:
#   bash scripts/check-content.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

FAIL=0
WARNINGS=0

# Directories and file types to scan
SCAN_DIRS=(
  "hotel-guest/src"
  "hotel-guest/index.html"
  "hotel-owner/src"
  "frontend/src"
  "res-web/src"
  "backend/app"
  "das-elb-hotel-optimised/pages"
  "das-elb-hotel-optimised/components"
)

# File extensions to scan
INCLUDE_PATTERN="--include=*.tsx --include=*.ts --include=*.jsx --include=*.js --include=*.html --include=*.py"

echo ""
echo -e "${BOLD}=== Das Elb Content Guard ===${NC}"
echo ""

# ── 1. Wrong city name ─────────────────────────────────────────────────
echo -e "${BOLD}[1/5] Checking for wrong city references...${NC}"

CITY_VIOLATIONS=$(
  for dir in "${SCAN_DIRS[@]}"; do
    [ -e "$dir" ] || continue
    # Exclude: comments, test fixtures, this script itself, docs
    grep -rn "Hamburg" "$dir" $INCLUDE_PATTERN 2>/dev/null \
      | grep -v "^\s*//" \
      | grep -v "# " \
      | grep -v "\.test\." \
      | grep -v "\.spec\." \
      | grep -v "seed\.ts" \
      | grep -v "check-content\.sh" \
      | grep -v "ci-guide\.md" \
      || true
  done
)

if [ -n "$CITY_VIOLATIONS" ]; then
  echo -e "${RED}✗ Wrong city references found (hotel is in Magdeburg, not Hamburg):${NC}"
  echo "$CITY_VIOLATIONS"
  FAIL=1
else
  echo -e "${GREEN}✓ No wrong city references${NC}"
fi

echo ""

# ── 2. Demo credentials in UI ──────────────────────────────────────────
echo -e "${BOLD}[2/5] Checking for demo credentials in UI...${NC}"

DEMO_VIOLATIONS=$(
  for dir in "${SCAN_DIRS[@]}"; do
    [ -e "$dir" ] || continue
    grep -rn "fillDemo\|Demo Credentials\|CopyChip" "$dir" $INCLUDE_PATTERN 2>/dev/null \
      | grep -v "\.test\." \
      | grep -v "\.spec\." \
      | grep -v "seed\.ts" \
      | grep -v "check-content\.sh" \
      || true
  done
)

if [ -n "$DEMO_VIOLATIONS" ]; then
  echo -e "${RED}✗ Demo credential UI elements found (must not appear in production):${NC}"
  echo "$DEMO_VIOLATIONS"
  FAIL=1
else
  echo -e "${GREEN}✓ No demo credential UI elements${NC}"
fi

echo ""

# ── 3. Stub / placeholder backend responses ────────────────────────────
echo -e "${BOLD}[3/5] Checking for stub backend responses...${NC}"

STUB_VIOLATIONS=$(
  for dir in backend/app; do
    [ -e "$dir" ] || continue
    grep -rn "stub response\|LLM integration pending\|This is a stub" "$dir" --include="*.py" 2>/dev/null \
      | grep -v "\.test\." \
      | grep -v "test_" \
      | grep -v "#" \
      || true
  done
)

if [ -n "$STUB_VIOLATIONS" ]; then
  echo -e "${RED}✗ Stub/placeholder backend responses found:${NC}"
  echo "$STUB_VIOLATIONS"
  FAIL=1
else
  echo -e "${GREEN}✓ No stub backend responses${NC}"
fi

echo ""

# ── 4. Hardcoded localhost in environment configs ──────────────────────
echo -e "${BOLD}[4/5] Checking for localhost in production env files...${NC}"

# Only check Dockerfiles and render.yaml — not .env.local / .env.example
ENV_VIOLATIONS=$(
  grep -n "localhost\|127\.0\.0\.1" \
    render.yaml \
    frontend/Dockerfile \
    hotel-guest/Dockerfile \
    hotel-owner/Dockerfile \
    res-web/Dockerfile \
    das-elb-hotel-optimised/Dockerfile \
    2>/dev/null \
  | grep -v "^\s*#" \
  | grep -v "EXPOSE\|health.*cmd\|pg_isready\|redis-cli" \
  || true
)

if [ -n "$ENV_VIOLATIONS" ]; then
  echo -e "${RED}✗ localhost references in production configs:${NC}"
  echo "$ENV_VIOLATIONS"
  FAIL=1
else
  echo -e "${GREEN}✓ No localhost in production configs${NC}"
fi

echo ""

# ── 5. Mock query cycles (previous voice agent bug) ────────────────────
echo -e "${BOLD}[5/5] Checking for mock data cycles in app code...${NC}"

MOCK_VIOLATIONS=$(
  for dir in hotel-owner/src frontend/src; do
    [ -e "$dir" ] || continue
    grep -rn "mockQueries\|queryIndexRef\|simulate.*voice\|After 2s simulate" "$dir" $INCLUDE_PATTERN 2>/dev/null \
      | grep -v "\.test\." \
      | grep -v "\.spec\." \
      || true
  done
)

if [ -n "$MOCK_VIOLATIONS" ]; then
  echo -e "${RED}✗ Mock data cycles found in production code:${NC}"
  echo "$MOCK_VIOLATIONS"
  FAIL=1
else
  echo -e "${GREEN}✓ No mock data cycles${NC}"
fi

echo ""

# ── Summary ────────────────────────────────────────────────────────────
if [ "$FAIL" -eq 1 ]; then
  echo -e "${RED}${BOLD}✗ Content guard FAILED — fix the issues above before deploying.${NC}"
  echo ""
  echo "These checks exist because:"
  echo "  - Wrong city names mean users see incorrect location info"
  echo "  - Demo credentials expose test accounts in production"
  echo "  - Stub responses mean features appear to work but save nothing"
  echo "  - localhost in prod configs means the app calls the wrong backend"
  echo ""
  exit 1
else
  echo -e "${GREEN}${BOLD}✓ All content guard checks passed.${NC}"
  echo ""
fi
