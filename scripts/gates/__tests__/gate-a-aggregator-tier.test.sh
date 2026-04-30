#!/usr/bin/env bash
# Smoke test: run-gate-a.sh aggregator tier semantics.
#
# Verifies that:
#   A. A failing BLOCKING fragment fails the aggregator (exit 1).
#   B. A failing REPORT fragment does NOT fail the aggregator (exit 0).
#   C. Mode lookup defaults to BLOCKING when MODES.json is missing or
#      doesn't list the fragment (fail-closed).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/scripts/gates"
cp "$REPO_ROOT/scripts/gates/run-gate-a.sh" "$TMPDIR/scripts/gates/"
cp "$REPO_ROOT/scripts/gates/get-mode.py" "$TMPDIR/scripts/gates/"
cp "$REPO_ROOT/scripts/gates/mode-lookup.sh" "$TMPDIR/scripts/gates/"

# Build a MODES.json declaring two synthetic fragments
cat > "$TMPDIR/scripts/gates/MODES.json" <<'EOF'
{
  "gate_a_fragments": {
    "a-cross-source-synthetic-blocking": {
      "mode": "BLOCKING",
      "owning_dispatch": "test",
      "rationale": "smoke test"
    },
    "a-cross-source-synthetic-report": {
      "mode": "REPORT",
      "owning_dispatch": "test",
      "rationale": "smoke test"
    }
  }
}
EOF

# Synthetic REPORT fragment that always fails
cat > "$TMPDIR/scripts/gates/a-cross-source-synthetic-report.sh" <<'EOF'
#!/usr/bin/env bash
echo "synthetic REPORT failure"
exit 1
EOF
chmod +x "$TMPDIR/scripts/gates/a-cross-source-synthetic-report.sh"

# Synthetic BLOCKING fragment — start with passing, switch to failing
cat > "$TMPDIR/scripts/gates/a-cross-source-synthetic-blocking.sh" <<'EOF'
#!/usr/bin/env bash
echo "synthetic BLOCKING pass"
exit 0
EOF
chmod +x "$TMPDIR/scripts/gates/a-cross-source-synthetic-blocking.sh"

cd "$TMPDIR"

# Case A — BLOCKING passes, REPORT fails → aggregator passes
out_a=$(bash scripts/gates/run-gate-a.sh 2>&1 || true)
status_a=$?
if ! echo "$out_a" | grep -q "Gate A PASSED"; then
  echo "FAIL (A): aggregator failed when only REPORT fragment failed"
  echo "$out_a"
  exit 1
fi
echo "OK (A): REPORT failure does not fail aggregator"

# Case B — flip BLOCKING to fail
cat > "$TMPDIR/scripts/gates/a-cross-source-synthetic-blocking.sh" <<'EOF'
#!/usr/bin/env bash
echo "synthetic BLOCKING failure"
exit 1
EOF
out_b=$(bash scripts/gates/run-gate-a.sh 2>&1 || true)
if echo "$out_b" | grep -q "Gate A PASSED"; then
  echo "FAIL (B): aggregator passed when BLOCKING fragment failed"
  echo "$out_b"
  exit 1
fi
if ! echo "$out_b" | grep -q "Gate A FAILED"; then
  echo "FAIL (B): aggregator did not say 'Gate A FAILED'"
  echo "$out_b"
  exit 1
fi
echo "OK (B): BLOCKING failure fails aggregator"

# Case C — unknown fragment defaults to BLOCKING (fail-closed)
cat > "$TMPDIR/scripts/gates/a-cross-source-unknown.sh" <<'EOF'
#!/usr/bin/env bash
echo "unknown synthetic"
exit 1
EOF
chmod +x "$TMPDIR/scripts/gates/a-cross-source-unknown.sh"
# Reset BLOCKING to pass so only the unknown fragment can fail aggregator
cat > "$TMPDIR/scripts/gates/a-cross-source-synthetic-blocking.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
out_c=$(bash scripts/gates/run-gate-a.sh 2>&1 || true)
if echo "$out_c" | grep -q "Gate A PASSED"; then
  echo "FAIL (C): unknown fragment did not default to BLOCKING (fail-closed broken)"
  echo "$out_c"
  exit 1
fi
echo "OK (C): unknown fragment defaults to BLOCKING (fail-closed)"
