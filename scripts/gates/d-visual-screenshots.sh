#!/usr/bin/env bash
# Gate D — Visual screenshots.
#
# Every screen catalogued in Parts 2A/2B/2C has a Playwright (admin) or
# Maestro (mobile) test that captures all 4 required states (loading, empty,
# error, success) and matches a baseline image. Visual regressions blocked.
#
# Per Phase 14 Part 4 §"Gate D — Visual screenshots".

set -euo pipefail

fail=0

# Admin Playwright suite
if [ -d "apps/admin/tests/visual" ]; then
  echo "Running admin Playwright screenshot suite..."
  pushd apps/admin > /dev/null
  if ! pnpm exec playwright test tests/visual/ --update-snapshots=missing; then
    fail=1
  fi
  popd > /dev/null
else
  echo "Gate D: apps/admin/tests/visual not yet present — skipping admin (will be populated by Dispatch 07)"
fi

# Mobile Maestro flows
if [ -d "apps/mobile/.maestro/visual" ]; then
  echo "Running mobile Maestro screenshot flows..."
  pushd apps/mobile > /dev/null
  if ! maestro test .maestro/visual/ --output ../../artifacts/maestro-output; then
    fail=1
  fi
  popd > /dev/null
else
  echo "Gate D: apps/mobile/.maestro/visual not yet present — skipping mobile (will be populated by Dispatches 11/12)"
fi

# Verify no diffs exceed threshold
if [ -d "apps/admin/test-results" ]; then
  diffs=$(find apps/admin/test-results -name "*-diff.png" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$diffs" -gt 0 ]; then
    echo "Gate D FAILED — $diffs visual regressions detected"
    echo "Review failing screenshots in apps/admin/test-results/"
    fail=1
  fi
fi

if [ "$fail" -eq 1 ]; then
  exit 1
fi
echo "Gate D PASSED"
