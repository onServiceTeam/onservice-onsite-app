#!/usr/bin/env bash
# Smoke test: Gate C's article-7.1-no-axios check rejects a client-side
# axios import (apps/) and accepts a server-side axios import (packages/api/).
#
# Article 7.1 is BLOCKING. The smoke test verifies both the rejection (apps/
# scope) AND the scope correction made in D03 (server outbound is allowed).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

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

cat > "$TMPDIR_A/packages/api/__tests__/bigint-money-precision.test.ts" <<'EOF'
test('1',()=>{});test('2',()=>{});test('3',()=>{});test('4',()=>{});test('5',()=>{});
EOF
echo "<!-- gate-b: no-bugs-this-dispatch -->" > "$TMPDIR_A/.ai-coder/dispatches/D99-closeout.md"

for f in c-constitution.sh MODES.json get-mode.py mode-lookup.sh; do
  cp "$REPO_ROOT/scripts/gates/$f" "$TMPDIR_A/scripts/gates/"
done

cd "$TMPDIR_A"
output_a=$(DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1 || true)

if ! echo "$output_a" | grep -qE "article-7\.1.*BLOCKING|axios"; then
  echo "FAIL (case A): gate-c did not flag client axios"
  echo "$output_a"
  exit 1
fi
if ! echo "$output_a" | grep -qE "Gate C FAILED"; then
  echo "FAIL (case A): gate-c did not exit failed despite client axios"
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

cat > "$TMPDIR_B/packages/api/__tests__/bigint-money-precision.test.ts" <<'EOF'
test('1',()=>{});test('2',()=>{});test('3',()=>{});test('4',()=>{});test('5',()=>{});
EOF
echo "<!-- gate-b: no-bugs-this-dispatch -->" > "$TMPDIR_B/.ai-coder/dispatches/D99-closeout.md"

for f in c-constitution.sh MODES.json get-mode.py mode-lookup.sh; do
  cp "$REPO_ROOT/scripts/gates/$f" "$TMPDIR_B/scripts/gates/"
done

cd "$TMPDIR_B"
output_b=$(DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1 || true)

# Article 7.1 must report OK because axios is only in packages/, not apps/
if ! echo "$output_b" | grep -qE "article-7\.1-no-axios \[BLOCKING\]: OK"; then
  echo "FAIL (case B): gate-c flagged server axios when it should accept it"
  echo "$output_b"
  exit 1
fi
echo "OK (case B): gate-c accepts server-side axios"
