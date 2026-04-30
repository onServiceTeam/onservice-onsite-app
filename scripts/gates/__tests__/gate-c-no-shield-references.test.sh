#!/usr/bin/env bash
# Smoke test: c-constitution-no-shield-references.sh rejects a SiguradoShield
# code-line reintroduction and accepts a comment-line documentation reference.
#
# Verifies four behaviors:
#   A. SiguradoShield trademark in user-facing JSX text → FAIL.
#   B. siguradoShieldXxx identifier in production code → FAIL.
#   C. SiguradoShield in a JS line comment → PASS (deprecation comments
#      legitimately reference the term to document why it was removed).
#   D. SiguradoShield in an allowlisted path (e.g., LAUNCH-LIMITATIONS.md) → PASS.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/scripts/gates"
cp "$REPO_ROOT/scripts/gates/c-constitution-no-shield-references.sh" "$TMPDIR/scripts/gates/"

run_gate() {
  cd "$TMPDIR"
  bash scripts/gates/c-constitution-no-shield-references.sh 2>&1 || true
}

# ----------------------------------------------------------------------------
# Case A — SiguradoShield trademark in user-facing JSX → FAIL
# ----------------------------------------------------------------------------
mkdir -p "$TMPDIR/apps/mobile/app/customer"
cat > "$TMPDIR/apps/mobile/app/customer/foo.tsx" <<'EOF'
export const Foo = () => <Text>SiguradoShield protection.</Text>;
EOF

out_a=$(run_gate)
if echo "$out_a" | grep -qE "no-shield-references \[BLOCKING\]: OK"; then
  echo "FAIL (A): gate accepted a SiguradoShield trademark in JSX text"
  echo "$out_a"
  exit 1
fi
echo "OK (A): gate rejects SiguradoShield trademark in JSX"

rm -f "$TMPDIR/apps/mobile/app/customer/foo.tsx"

# ----------------------------------------------------------------------------
# Case B — siguradoShieldXxx identifier in code → FAIL
# ----------------------------------------------------------------------------
mkdir -p "$TMPDIR/apps/mobile/src/config"
cat > "$TMPDIR/apps/mobile/src/config/platform.config.ts" <<'EOF'
export const platformConfig = {
  siguradoShieldMaxCoverage: 5000000,
};
EOF

out_b=$(run_gate)
if echo "$out_b" | grep -qE "no-shield-references \[BLOCKING\]: OK"; then
  echo "FAIL (B): gate accepted a siguradoShieldMaxCoverage identifier"
  echo "$out_b"
  exit 1
fi
echo "OK (B): gate rejects siguradoShieldXxx identifier"

rm -f "$TMPDIR/apps/mobile/src/config/platform.config.ts"

# ----------------------------------------------------------------------------
# Case C — comment-line documentation reference → PASS
# ----------------------------------------------------------------------------
mkdir -p "$TMPDIR/apps/mobile/app"
cat > "$TMPDIR/apps/mobile/app/onboarding.tsx" <<'EOF'
// Phase 14 D04 SiguradoShield pull — slide 2 used to advertise it.
// Replaced with escrow-only language.
export const Onboarding = () => null;
EOF

out_c=$(run_gate)
if ! echo "$out_c" | grep -qE "no-shield-references \[BLOCKING\]: OK"; then
  echo "FAIL (C): gate rejected a deprecation comment that legitimately"
  echo "         documents the SiguradoShield removal"
  echo "$out_c"
  exit 1
fi
echo "OK (C): gate accepts deprecation comments"

rm -f "$TMPDIR/apps/mobile/app/onboarding.tsx"

# ----------------------------------------------------------------------------
# Case D — reference in allowlisted path → PASS
# ----------------------------------------------------------------------------
cat > "$TMPDIR/LAUNCH-LIMITATIONS.md" <<'EOF'
## §23 — SiguradoShield deferred to v1.1+
EOF

out_d=$(run_gate)
if ! echo "$out_d" | grep -qE "no-shield-references \[BLOCKING\]: OK"; then
  echo "FAIL (D): gate rejected a reference in LAUNCH-LIMITATIONS.md"
  echo "$out_d"
  exit 1
fi
echo "OK (D): gate accepts references in allowlisted paths"
