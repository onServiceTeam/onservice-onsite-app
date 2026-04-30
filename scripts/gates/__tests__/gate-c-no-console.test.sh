#!/usr/bin/env bash
# Smoke test: Gate C's article-4.2-no-console check rejects a console.log
# in production code.
#
# Article 4.2 is currently in REPORT mode (per MODES.json), but the check
# itself must still detect violations correctly — REPORT means "log don't
# block," not "skip detection." This test verifies the detection logic.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Synthesize a minimal tree the gate scans
mkdir -p "$TMPDIR/apps/mobile/src" "$TMPDIR/scripts/gates" "$TMPDIR/.ai-coder/dispatches"
echo "console.log('synthetic violation');" > "$TMPDIR/apps/mobile/src/bad.ts"

# Empty placeholders the gate also expects
mkdir -p "$TMPDIR/apps/admin/src" "$TMPDIR/packages/api/src" "$TMPDIR/apps/mobile/app"
mkdir -p "$TMPDIR/packages/api/__tests__"

# Article 12 needs bigint-money-precision.test.ts with >=5 tests
cat > "$TMPDIR/packages/api/__tests__/bigint-money-precision.test.ts" <<'EOF'
test('one', () => {});
test('two', () => {});
test('three', () => {});
test('four', () => {});
test('five', () => {});
EOF

# Article 16 needs a closeout. Use a no-bugs marker to keep it minimal.
echo "<!-- gate-b: no-bugs-this-dispatch -->" > "$TMPDIR/.ai-coder/dispatches/D99-closeout.md"

# Copy the gate scripts + helpers into the temp dir (so the gate finds MODES.json)
cp "$REPO_ROOT/scripts/gates/c-constitution.sh" "$TMPDIR/scripts/gates/"
cp "$REPO_ROOT/scripts/gates/MODES.json" "$TMPDIR/scripts/gates/"
cp "$REPO_ROOT/scripts/gates/get-mode.py" "$TMPDIR/scripts/gates/"
cp "$REPO_ROOT/scripts/gates/mode-lookup.sh" "$TMPDIR/scripts/gates/"

cd "$TMPDIR"
output=$(DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1 || true)

# The console violation must be reported (regardless of REPORT/BLOCKING tier)
if ! echo "$output" | grep -qE "synthetic violation|console\.log"; then
  echo "FAIL: gate-c did not detect synthetic console.log"
  echo "Output was:"
  echo "$output"
  exit 1
fi

# Article 4.2 must be in REPORT mode per current MODES.json — the gate should
# log it but not blocking-fail on console.* alone.
if ! echo "$output" | grep -qE "article-4\.2-no-console.*REPORT"; then
  echo "FAIL: gate-c didn't tag article-4.2 as REPORT"
  echo "Output was:"
  echo "$output"
  exit 1
fi

echo "OK: gate-c detects console.log and tags article-4.2 as REPORT"
