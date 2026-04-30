#!/usr/bin/env bash
# Smoke test: Gate B's no-bugs-this-dispatch marker.
#
# Verifies three behaviors:
#   A. Empty closeout (no bugs, no marker) → FAIL.
#   B. Closeout with marker, no bugs → PASS.
#   C. Closeout with marker AND bug claims → FAIL (ambiguous).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/.ai-coder/dispatches" "$TMPDIR/scripts/gates"
cp "$REPO_ROOT/scripts/gates/b-bug-deferral.sh" "$TMPDIR/scripts/gates/"

cd "$TMPDIR"
git init -q
git config user.email t@t.t
git config user.name t
git commit --allow-empty -q -m "init"

run_b() {
  BASE_REF=HEAD bash scripts/gates/b-bug-deferral.sh 99 2>&1 || true
}

# Case A — empty closeout, no marker → FAIL
echo "# D99 closeout — empty" > .ai-coder/dispatches/D99-closeout.md
out_a=$(run_b)
if echo "$out_a" | grep -q "Gate B PASSED"; then
  echo "FAIL (A): empty closeout passed Gate B (should fail)"
  echo "$out_a"
  exit 1
fi
echo "OK (A): empty closeout fails Gate B"

# Case B — marker present, no bugs → PASS
cat > .ai-coder/dispatches/D99-closeout.md <<'EOF'
# D99 closeout — meta-only

<!-- gate-b: no-bugs-this-dispatch -->
EOF
out_b=$(run_b)
if ! echo "$out_b" | grep -q "Gate B PASSED"; then
  echo "FAIL (B): no-bugs marker did not pass Gate B"
  echo "$out_b"
  exit 1
fi
echo "OK (B): no-bugs marker passes Gate B"

# Case C — marker AND bug claim → FAIL (ambiguous)
cat > .ai-coder/dispatches/D99-closeout.md <<'EOF'
# D99 closeout — both

<!-- gate-b: no-bugs-this-dispatch -->

- Bug 9999 — synthetic — apps/foo.ts — test: tests/foo.test.ts:bug-9999
EOF
out_c=$(run_b)
if echo "$out_c" | grep -q "Gate B PASSED"; then
  echo "FAIL (C): marker+bugs combo passed Gate B (should fail as ambiguous)"
  echo "$out_c"
  exit 1
fi
if ! echo "$out_c" | grep -qi "ambiguous"; then
  echo "FAIL (C): marker+bugs combo failed but error didn't mention ambiguity"
  echo "$out_c"
  exit 1
fi
echo "OK (C): marker+bugs combo fails Gate B as ambiguous"
