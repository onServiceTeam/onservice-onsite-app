#!/usr/bin/env bash
# Smoke test: report-mode Gates D and E say NOT RUN instead of a silent green.
#
# Added 2026-10-14 (D40). For each of d-visual-screenshots.sh and
# e-mutation-testing.sh, in a temporary copy:
#   - REPORT mode: exit 0 (the mode is unchanged), print
#     "Gate X NOT RUN: report mode (MODES.json)", emit a GitHub warning
#     annotation, write the job summary, and never print "PASSED".
#   - BLOCKING mode: no NOT RUN line (the real check path is taken).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

write_modes() {  # write_modes <dir> <gate_d mode> <gate_e mode>
  cat > "$1/scripts/gates/MODES.json" <<EOF
{
  "gate_d_state": { "mode": "$2", "owning_dispatch": "test", "rationale": "smoke",
                    "approved_by": "test", "reviewed_on": "test" },
  "gate_e_state": { "mode": "$3", "owning_dispatch": "test", "rationale": "smoke",
                    "approved_by": "test", "reviewed_on": "test" }
}
EOF
}

for gate in D E; do
  case "$gate" in
    D) script=d-visual-screenshots.sh ;;
    E) script=e-mutation-testing.sh ;;
  esac
  dir="$WORK/$gate"
  mkdir -p "$dir/scripts/gates"
  for f in "$script" mode-lookup.sh get-mode.py; do
    cp "$REPO_ROOT/scripts/gates/$f" "$dir/scripts/gates/"
  done

  # REPORT mode
  write_modes "$dir" REPORT REPORT
  summary="$dir/step-summary.md"
  : > "$summary"
  set +e
  out=$(cd "$dir" && GITHUB_ACTIONS=true GITHUB_STEP_SUMMARY="$summary" bash "scripts/gates/$script" 2>&1)
  status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    echo "FAIL (Gate $gate REPORT): exit $status; report mode must still exit 0 (mode unchanged)"
    echo "$out"
    exit 1
  fi
  for wanted in "Gate $gate NOT RUN: report mode (MODES.json)" "::warning title=Gate $gate NOT RUN::"; do
    if ! grep -qF -- "$wanted" <<<"$out"; then
      echo "FAIL (Gate $gate REPORT): output does not contain: $wanted"
      echo "$out"
      exit 1
    fi
  done
  if grep -qF "PASSED" <<<"$out"; then
    echo "FAIL (Gate $gate REPORT): a report-mode run printed PASSED"
    echo "$out"
    exit 1
  fi
  if ! grep -qF "Gate $gate NOT RUN:" "$summary"; then
    echo "FAIL (Gate $gate REPORT): the job summary does not say NOT RUN"
    cat "$summary"
    exit 1
  fi
  echo "OK (Gate $gate REPORT): exits 0 but says NOT RUN in the log, an annotation and the job summary"

  # BLOCKING mode: the NOT RUN notice must not appear. (In this empty copy
  # there is nothing to compare, so the outcome itself is not checked here.)
  write_modes "$dir" BLOCKING BLOCKING
  out=$(cd "$dir" && GIT_DIR="$dir/not-a-repo" bash "scripts/gates/$script" 2>&1 || true)
  if grep -qF "NOT RUN" <<<"$out"; then
    echo "FAIL (Gate $gate BLOCKING): printed NOT RUN in blocking mode"
    echo "$out"
    exit 1
  fi
  echo "OK (Gate $gate BLOCKING): no NOT RUN notice"
done
