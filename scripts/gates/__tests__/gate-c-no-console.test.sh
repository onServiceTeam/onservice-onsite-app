#!/usr/bin/env bash
# Smoke test: Gate C's article-4.2-no-console check rejects a console.log
# in production code.
#
# Article 4.2 is currently in REPORT mode (per MODES.json), but the check
# itself must still detect violations correctly — REPORT means "log don't
# block," not "skip detection." This test verifies the detection logic.
#
# Correction (2026-10-14, D40): article 4.2 has been BLOCKING since D14r-8
# (see the note further down and MODES.json), so the paragraph above is
# historical. Also, before this date the fixture copied only four gate files.
# The unique-regression-ids, no-fake-tests and no-shield-references articles
# then failed for a missing script, so the "Gate C FAILED" check passed even
# with no console.log at all, and the "BLOCKING" pattern also matched the
# article's OK line. Now the fixture copies every script Gate C calls, a clean
# run must print "Gate C PASSED", and the run with the console.log must print
# the article's own VIOLATION line with exactly one BLOCKING failure.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Synthesize a minimal tree the gate scans
mkdir -p "$TMPDIR/apps/mobile/src" "$TMPDIR/scripts/gates" "$TMPDIR/.ai-coder/dispatches"

# Empty placeholders the gate also expects
mkdir -p "$TMPDIR/apps/admin/src" "$TMPDIR/packages/api/src" "$TMPDIR/apps/mobile/app"
mkdir -p "$TMPDIR/packages/api/__tests__"

# Article 12 needs bigint-money-precision.test.ts with >=5 tests, one per line
# (the article counts lines that start with test( or it().
cat > "$TMPDIR/packages/api/__tests__/bigint-money-precision.test.ts" <<'EOF'
test('one', () => {});
test('two', () => {});
test('three', () => {});
test('four', () => {});
test('five', () => {});
EOF

# Article 16 needs a closeout. Use a no-bugs marker to keep it minimal.
echo "<!-- gate-b: no-bugs-this-dispatch -->" > "$TMPDIR/.ai-coder/dispatches/D99-closeout.md"

# Copy every script Gate C calls, plus MODES.json, into the temp dir. A
# missing helper would make its article fail and hide what this test checks.
# (2026-10-17: the no-admin-password-seeds script added when that article
# was wired in, and c-db-tests-fail-closed.py when that article was added.)
for f in c-constitution.sh MODES.json get-mode.py mode-lookup.sh \
         c-unique-regression-ids.py c-no-fake-tests.py \
         c-constitution-no-shield-references.sh \
         c-constitution-no-admin-password-seeds.sh \
         c-db-tests-fail-closed.py; do
  cp "$REPO_ROOT/scripts/gates/$f" "$TMPDIR/scripts/gates/"
done

cd "$TMPDIR"

# --- Clean case: no console.* anywhere, the whole gate must pass -----------
echo "export const ok = 1;" > "$TMPDIR/apps/mobile/src/good.ts"
set +e
clean_output=$(DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1)
clean_status=$?
set -e
if [ "$clean_status" -ne 0 ] \
   || ! echo "$clean_output" | grep -qE "article-4\.2-no-console \[BLOCKING\]: OK" \
   || ! echo "$clean_output" | grep -qF "Gate C PASSED"; then
  echo "FAIL: the clean fixture did not pass Gate C, so the failing case below would prove nothing"
  echo "Output was:"
  echo "$clean_output"
  exit 1
fi
echo "OK (clean): the fixture passes Gate C when there is no console.*"

# --- Violation case: one console.log in production code --------------------
echo "console.log('synthetic violation');" > "$TMPDIR/apps/mobile/src/bad.ts"
set +e
output=$(DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1)
status=$?
set -e

# The console violation must be reported, with the file and the line text.
if ! echo "$output" | grep -qE "apps/mobile/src/bad\.ts:.*synthetic violation"; then
  echo "FAIL: gate-c did not detect synthetic console.log"
  echo "Output was:"
  echo "$output"
  exit 1
fi

# Article 4.2 was promoted to BLOCKING in D14r-8 (per MODES.json
# `_updated_by_dispatch`). The gate now blocking-fails on console.*
# violations. Smoke test was updated alongside the promotion.
# 2026-10-14 (D40): require the article's own VIOLATION line, not any line
# that mentions the article and BLOCKING (the OK line did too).
if ! echo "$output" | grep -qF "Gate C VIOLATION (article-4.2-no-console) [BLOCKING]"; then
  echo "FAIL: gate-c didn't tag article-4.2 as a BLOCKING violation"
  echo "Output was:"
  echo "$output"
  exit 1
fi

# When a BLOCKING violation is present, the aggregator must fail the gate,
# and the console article must be the only BLOCKING failure (the clean run
# above passed, so nothing else in the fixture fails).
if [ "$status" -eq 0 ] \
   || ! echo "$output" | grep -qF "BLOCKING failed: 1" \
   || ! echo "$output" | grep -qF "Gate C FAILED"; then
  echo "FAIL: gate-c didn't fail the gate on synthetic BLOCKING violation"
  echo "Output was:"
  echo "$output"
  exit 1
fi

echo "OK: gate-c detects console.log, tags article-4.2 as BLOCKING, fails the gate"
