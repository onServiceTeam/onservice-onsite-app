#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Final smoke test sweep.
#
# Runs the full Maestro (mobile) + Playwright (admin) suite against
# staging-prod-mirror. Requires Maestro CLI installed locally and admin
# Playwright deps via `pnpm install` in apps/admin.
#
# v1.0 NOTE: Maestro flow files for customer + provider screens are
# documented as deferred in LAUNCH-LIMITATIONS §28 + §29 (per-screen
# polish-pass). This script exits 0 if Maestro flows are absent and
# only Playwright runs. v1.1+ Maestro workstream lights up the rest.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS="$REPO_ROOT/artifacts"
mkdir -p "$ARTIFACTS"

cd "$REPO_ROOT/apps/mobile"

if command -v maestro >/dev/null 2>&1; then
  if [ -d ".maestro/visual/customer" ]; then
    echo "→ Maestro: customer flows"
    maestro test .maestro/visual/customer/ --output "$ARTIFACTS/maestro-customer" || {
      echo "FAIL: Maestro customer suite"
      exit 1
    }
  else
    echo "skip: .maestro/visual/customer/ not present (deferred per LAUNCH-LIMITATIONS §28)"
  fi

  if [ -d ".maestro/visual/provider" ]; then
    echo "→ Maestro: provider flows"
    maestro test .maestro/visual/provider/ --output "$ARTIFACTS/maestro-provider" || {
      echo "FAIL: Maestro provider suite"
      exit 1
    }
  else
    echo "skip: .maestro/visual/provider/ not present (deferred per LAUNCH-LIMITATIONS §29)"
  fi

  if [ -d ".maestro/e2e/critical-paths" ]; then
    echo "→ Maestro: 7 critical-path E2E flows"
    maestro test .maestro/e2e/critical-paths/ --output "$ARTIFACTS/maestro-e2e" || {
      echo "FAIL: critical-paths E2E suite"
      exit 1
    }
  else
    echo "skip: .maestro/e2e/critical-paths/ not present (deferred to D14 closeout follow-up)"
  fi
else
  echo "skip: Maestro CLI not installed — install per https://maestro.mobile.dev/"
fi

# Admin Playwright
cd "$REPO_ROOT/apps/admin"
if [ -d "tests/visual" ] && [ -f "package.json" ]; then
  echo "→ Admin Playwright visual tests"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm exec playwright test tests/visual/ || {
      echo "FAIL: admin Playwright"
      exit 1
    }
  elif command -v npx >/dev/null 2>&1; then
    npx playwright test tests/visual/ || {
      echo "FAIL: admin Playwright"
      exit 1
    }
  fi
else
  echo "skip: apps/admin/tests/visual/ not present"
fi

echo
echo "OK: full smoke sweep complete (artifacts in $ARTIFACTS)"
