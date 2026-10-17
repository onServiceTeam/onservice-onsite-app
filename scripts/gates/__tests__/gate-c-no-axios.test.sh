#!/usr/bin/env bash
# Smoke test: Gate C's article-7.1-no-axios check rejects a client-side
# axios import (apps/) and accepts a server-side axios import (packages/api/).
#
# Article 7.1 is BLOCKING. The smoke test verifies both the rejection (apps/
# scope) AND the scope correction made in D03 (server outbound is allowed).
#
# Correction (2026-10-14, D40): before this date both fixtures copied only
# four gate files and wrote the five bigint tests on one line. The
# bigint-money-tests, unique-regression-ids, no-fake-tests and
# no-shield-references articles then always failed, so case A's
# "Gate C FAILED" check passed with or without the axios import, and its
# first pattern ("axios") also matched the article's OK line. Now both
# fixtures copy every script Gate C calls and write one test per line. Case B
# (server axios only) must pass the whole gate, which proves the fixture is
# clean. Case A must print the article's own VIOLATION line with exactly one
# BLOCKING failure.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# Every script Gate C calls, plus MODES.json. A missing helper would make its
# article fail and hide what this test checks. (2026-10-17: the
# no-admin-password-seeds script added when that article was wired in, and
# c-db-tests-fail-closed.py when that article was added.)
GATE_C_FILES="c-constitution.sh MODES.json get-mode.py mode-lookup.sh
              c-unique-regression-ids.py c-no-fake-tests.py
              c-constitution-no-shield-references.sh
              c-constitution-no-admin-password-seeds.sh
              c-db-tests-fail-closed.py"

# write_bigint_fixture <dir>: article 12 needs >= 5 tests, one per line (it
# counts lines that start with test( or it().
write_bigint_fixture() {
  cat > "$1/packages/api/__tests__/bigint-money-precision.test.ts" <<'EOF'
test('1', () => {});
test('2', () => {});
test('3', () => {});
test('4', () => {});
test('5', () => {});
EOF
}

# ---------------------------------------------------------------------------
# Case A: client-side axios → must FAIL gate
# ---------------------------------------------------------------------------
TMPDIR_A=$(mktemp -d)
trap 'rm -rf "$TMPDIR_A" "${TMPDIR_B:-}"' EXIT

mkdir -p "$TMPDIR_A/apps/mobile/src" "$TMPDIR_A/scripts/gates" \
         "$TMPDIR_A/.ai-coder/dispatches" "$TMPDIR_A/packages/api/__tests__" \
         "$TMPDIR_A/packages/api/src" "$TMPDIR_A/apps/admin/src" \
         "$TMPDIR_A/apps/mobile/app"
echo "import axios from 'axios';" > "$TMPDIR_A/apps/mobile/src/bad.ts"

write_bigint_fixture "$TMPDIR_A"
echo "<!-- gate-b: no-bugs-this-dispatch -->" > "$TMPDIR_A/.ai-coder/dispatches/D99-closeout.md"

for f in $GATE_C_FILES; do
  cp "$REPO_ROOT/scripts/gates/$f" "$TMPDIR_A/scripts/gates/"
done

cd "$TMPDIR_A"
set +e
output_a=$(DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1)
status_a=$?
set -e

if ! echo "$output_a" | grep -qF "Gate C VIOLATION (article-7.1-no-axios) [BLOCKING]" \
   || ! echo "$output_a" | grep -qE "apps/mobile/src/bad\.ts:.*from 'axios'"; then
  echo "FAIL (case A): gate-c did not flag client axios"
  echo "$output_a"
  exit 1
fi
if [ "$status_a" -eq 0 ] \
   || ! echo "$output_a" | grep -qF "BLOCKING failed: 1" \
   || ! echo "$output_a" | grep -qE "Gate C FAILED"; then
  echo "FAIL (case A): gate-c did not exit failed despite client axios (or another article also failed)"
  echo "$output_a"
  exit 1
fi
echo "OK (case A): gate-c rejects client axios"

# ---------------------------------------------------------------------------
# Case B: server-side axios only → must PASS gate
# ---------------------------------------------------------------------------
TMPDIR_B=$(mktemp -d)
mkdir -p "$TMPDIR_B/apps/mobile/src" "$TMPDIR_B/scripts/gates" \
         "$TMPDIR_B/.ai-coder/dispatches" "$TMPDIR_B/packages/api/__tests__" \
         "$TMPDIR_B/packages/api/src/services" "$TMPDIR_B/apps/admin/src" \
         "$TMPDIR_B/apps/mobile/app"
# Server outbound axios — allowed
echo "import axios from 'axios';" > "$TMPDIR_B/packages/api/src/services/payment.service.ts"

write_bigint_fixture "$TMPDIR_B"
echo "<!-- gate-b: no-bugs-this-dispatch -->" > "$TMPDIR_B/.ai-coder/dispatches/D99-closeout.md"

for f in $GATE_C_FILES; do
  cp "$REPO_ROOT/scripts/gates/$f" "$TMPDIR_B/scripts/gates/"
done

cd "$TMPDIR_B"
set +e
output_b=$(DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1)
status_b=$?
set -e

# Article 7.1 must report OK because axios is only in packages/, not apps/
if ! echo "$output_b" | grep -qE "article-7\.1-no-axios \[BLOCKING\]: OK"; then
  echo "FAIL (case B): gate-c flagged server axios when it should accept it"
  echo "$output_b"
  exit 1
fi
# 2026-10-14 (D40): the whole gate must pass too. This proves the fixture is
# clean, so case A's failure comes from the client axios import alone.
if [ "$status_b" -ne 0 ] || ! echo "$output_b" | grep -qF "Gate C PASSED"; then
  echo "FAIL (case B): the clean fixture did not pass Gate C"
  echo "$output_b"
  exit 1
fi
echo "OK (case B): gate-c accepts server-side axios"
