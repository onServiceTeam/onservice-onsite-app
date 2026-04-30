#!/usr/bin/env bash
# Smoke test: Gate A's a-cross-source-no-axios.sh fragment rejects client axios.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/apps/admin/src" "$TMPDIR/scripts/gates"
echo "import axios from 'axios';" > "$TMPDIR/apps/admin/src/api-client.ts"

cp "$REPO_ROOT/scripts/gates/a-cross-source-no-axios.sh" "$TMPDIR/scripts/gates/"

cd "$TMPDIR"
output=$(bash scripts/gates/a-cross-source-no-axios.sh 2>&1 || true)
status=$?

if echo "$output" | grep -qE "Gate A — no client axios: OK"; then
  echo "FAIL: a-cross-source-no-axios accepted a client axios import"
  echo "$output"
  exit 1
fi
if ! echo "$output" | grep -qE "GATE A VIOLATION.*Bug 1271|client axios import detected"; then
  echo "FAIL: a-cross-source-no-axios produced wrong error"
  echo "$output"
  exit 1
fi
echo "OK: a-cross-source-no-axios correctly rejects client axios import"
