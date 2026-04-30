#!/usr/bin/env bash
# Gate D — Visual screenshots.
#
# Every screen catalogued in Parts 2A/2B/2C has a Playwright (admin) or
# Maestro (mobile) test that captures all 4 required states (loading, empty,
# error, success) and matches a baseline image. Visual regressions blocked.
#
# Tier (per MODES.json gate_d_state): REPORT until D07/D08/D11/D12 populate
# baselines. d-visual-screenshots.sh skips cleanly when the visual test
# directories are empty (placeholder READMEs only) so that PRs from earlier
# dispatches do not fail Gate D in CI.
#
# Per Phase 14 Part 4 §"Gate D — Visual screenshots" and Dispatch 03
# tiered-enforcement design.

set -euo pipefail

fail=0

# Detect actual test files (not just placeholder READMEs).
admin_tests=$(find apps/admin/tests/visual -type f \( -name "*.spec.ts" -o -name "*.spec.tsx" -o -name "*.test.ts" -o -name "*.test.tsx" \) 2>/dev/null | head -1 || true)
mobile_flows=$(find apps/mobile/.maestro/visual -type f -name "*.yaml" 2>/dev/null | head -1 || true)

# Admin Playwright suite
if [ -n "$admin_tests" ]; then
  echo "Running admin Playwright screenshot suite..."
  pushd apps/admin > /dev/null
  if ! pnpm exec playwright test tests/visual/ --update-snapshots=missing; then
    fail=1
  fi
  popd > /dev/null
elif [ -d "apps/admin/tests/visual" ]; then
  echo "Gate D: apps/admin/tests/visual present but no test files yet — skipping admin (will be populated by Dispatch 07)."
else
  echo "Gate D: apps/admin/tests/visual not yet present — skipping admin."
fi

# Mobile Maestro flows
if [ -n "$mobile_flows" ]; then
  echo "Running mobile Maestro screenshot flows..."
  pushd apps/mobile > /dev/null
  if ! maestro test .maestro/visual/ --output ../../artifacts/maestro-output; then
    fail=1
  fi
  popd > /dev/null
elif [ -d "apps/mobile/.maestro/visual" ]; then
  echo "Gate D: apps/mobile/.maestro/visual present but no flows yet — skipping mobile (will be populated by Dispatches 11/12)."
else
  echo "Gate D: apps/mobile/.maestro/visual not yet present — skipping mobile."
fi

# Verify no diffs exceed threshold (only meaningful if tests actually ran)
if [ -d "apps/admin/test-results" ] && [ -n "$admin_tests" ]; then
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
