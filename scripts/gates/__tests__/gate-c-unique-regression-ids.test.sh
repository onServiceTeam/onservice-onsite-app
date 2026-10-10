#!/usr/bin/env bash
# Smoke test: the unique regression-ID fragment rejects two unrelated tests
# that claim the same Bug ID, then accepts the same fixtures after correction.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEST_ROOT=$(mktemp -d)
trap 'rm -rf "$TEST_ROOT"' EXIT

mkdir -p "$TEST_ROOT/scripts/gates" "$TEST_ROOT/apps/admin/__tests__" "$TEST_ROOT/packages/api/__tests__"
cp "$REPO_ROOT/scripts/gates/c-unique-regression-ids.py" "$TEST_ROOT/scripts/gates/"

cat > "$TEST_ROOT/apps/admin/__tests__/first.test.ts" <<'EOF'
it('Bug UX-9999 - first behavior', () => {});
EOF
cat > "$TEST_ROOT/packages/api/__tests__/second.test.ts" <<'EOF'
test('Bug UX-9999 - unrelated behavior', () => {});
EOF

cd "$TEST_ROOT"
if duplicate_output=$(python3 scripts/gates/c-unique-regression-ids.py 2>&1); then
  echo "FAIL: unique regression-ID gate accepted duplicate Bug UX-9999 titles"
  echo "$duplicate_output"
  exit 1
fi
if ! echo "$duplicate_output" | grep -qE "Bug UX-9999 appears in 2 test titles"; then
  echo "FAIL: duplicate report did not identify Bug UX-9999 and both claims"
  echo "$duplicate_output"
  exit 1
fi

cat > "$TEST_ROOT/packages/api/__tests__/second.test.ts" <<'EOF'
test('Bug OPS-9999 - unrelated behavior', () => {});
EOF

if ! clean_output=$(python3 scripts/gates/c-unique-regression-ids.py 2>&1); then
  echo "FAIL: unique regression-ID gate rejected distinct Bug IDs"
  echo "$clean_output"
  exit 1
fi
if ! echo "$clean_output" | grep -qE "OK \(2 titled regressions\)"; then
  echo "FAIL: clean result did not report both distinct regressions"
  echo "$clean_output"
  exit 1
fi

echo "OK: unique regression-ID gate rejects duplicates and accepts distinct IDs"
