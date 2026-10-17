#!/usr/bin/env bash
# Smoke test: Gate A fragment a-cross-source-hashes-immutable.sh.
#
# Added 2026-10-17 (D40, review fix). In a temporary git repo it proves:
#   A. a change to a HASHES-CORRECTED.sha256 file since BASE_REF fails and
#      names the file;
#   B. an unrelated change passes, and the OK line names the base it used;
#   C. a BASE_REF that is not in the checkout (what a force-push does to
#      github.event.before) fails with NOT CHECKED. Before 2026-10-17 this
#      case printed OK having compared nothing;
#   D. no BASE_REF and no origin/master fails with NOT CHECKED, for the same
#      reason.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FRAGMENT="$REPO_ROOT/scripts/gates/a-cross-source-hashes-immutable.sh"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

cd "$TMPDIR"
git init -q
git config user.email t@t.t
git config user.name t
git config core.autocrlf false
mkdir -p .ai-coder/phase-13
echo "0000  example.md" > .ai-coder/phase-13/HASHES-CORRECTED.sha256
echo "one" > notes.txt
git add -A
git commit -q -m "base"
BASE=$(git rev-parse HEAD)

run_fragment() {  # run_fragment <BASE_REF or "unset">; sets out + status
  set +e
  if [ "$1" = "unset" ]; then
    out=$(env -u BASE_REF bash "$FRAGMENT" 2>&1)
  else
    out=$(BASE_REF="$1" bash "$FRAGMENT" 2>&1)
  fi
  status=$?
  set -e
}

expect_result() {  # expect_result <case> <0 or 1> <text that must appear>
  if [ "$status" -ne "$2" ] || ! grep -qF -- "$3" <<<"$out"; then
    echo "FAIL ($1): expected exit $2 and the text: $3"
    echo "  got exit $status:"
    echo "$out"
    exit 1
  fi
  echo "OK ($1)"
}

# Case B: an unrelated change passes and names the base.
echo "two" > notes.txt
git commit -q -am "unrelated change"
run_fragment "$BASE"
expect_result "B unrelated change" 0 "historical hashes immutable: OK (compared with $BASE)"

# Case A: a change to the historical hashes fails and names the file.
echo "1111  example.md" > .ai-coder/phase-13/HASHES-CORRECTED.sha256
git commit -q -am "edit historical hashes"
run_fragment "$BASE"
expect_result "A hashes changed" 1 ".ai-coder/phase-13/HASHES-CORRECTED.sha256"

# Case C: a base that is not in this checkout must not pass quietly.
run_fragment "0123456789abcdef0123456789abcdef01234567"
expect_result "C base not in checkout" 1 "historical hashes NOT CHECKED"

# Case D: no BASE_REF and no origin/master must not pass quietly either.
run_fragment "unset"
expect_result "D no base at all" 1 "historical hashes NOT CHECKED"
