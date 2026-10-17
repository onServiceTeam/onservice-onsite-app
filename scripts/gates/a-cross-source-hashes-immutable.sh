#!/usr/bin/env bash
# Phase 13 reconciliation artifact preservation.
# HASHES-CORRECTED.sha256 files are historical records and never modified going forward.
#
# 2026-10-17 (D40, review fix; a tightening under the gate-change rule in
# .ai-coder/governance/GATE-AMENDMENTS.md): the comparison base must exist.
# Before this, a BASE_REF that was not in the checkout made "git diff" fail,
# the error was thrown away ("2>/dev/null || true"), and the check printed OK
# having compared nothing. Since 2026-10-14 a push to master uses the previous
# master commit (github.event.before) as BASE_REF, and a force-push can make
# that commit unreachable (GitHub branch protection is off, D40). Now a
# missing base, or any other git diff error, fails with "NOT CHECKED".
# Self-test: scripts/gates/__tests__/gate-a-hashes-immutable-base.test.sh.

set -euo pipefail

# Defaults to comparing against origin/master if BASE_REF unset
BASE_REF=${BASE_REF:-origin/master}

if ! git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null; then
  echo "GATE A VIOLATION: historical hashes NOT CHECKED. The comparison base '$BASE_REF' is not a commit in this checkout (for example after a force-push, or in a shallow clone), so this check cannot see what changed. Fetch that commit or set BASE_REF to one that exists."
  exit 1
fi

if ! modified=$(git diff --name-only "$BASE_REF"..HEAD -- '.ai-coder/phase-*/HASHES-CORRECTED.sha256'); then
  echo "GATE A VIOLATION: historical hashes NOT CHECKED. git diff against '$BASE_REF' failed (message above)."
  exit 1
fi
if [ -n "$modified" ]; then
  echo "GATE A VIOLATION: HASHES-CORRECTED files are immutable historical records"
  echo "$modified"
  exit 1
fi
echo "Gate A — historical hashes immutable: OK (compared with $BASE_REF)"
