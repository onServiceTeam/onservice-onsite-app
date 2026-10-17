#!/usr/bin/env bash
# Smoke test: the "All gates passed" job in .github/workflows/gates.yml fails
# closed.
#
# Added 2026-10-14 (D40). Two parts:
#   1. Config check: the job keeps its name and needs list, has "if: always()"
#      (so it still runs when a gate fails or is skipped), and passes the real
#      job results in through NEEDS_JSON.
#   2. Behaviour check: the exact check block from gates.yml (between
#      "# BEGIN gates-summary-check" and "# END gates-summary-check") is copied
#      out and run against fixtures. It must FAIL when any gate job was
#      skipped, cancelled, failed, is missing, or when the input is unreadable,
#      and it must PASS only when all five finished with "success". It must
#      also say NOT RUN for gates that ran nothing.
# GitHub's own handling of "if: always()" cannot be run here; part 1 checks
# the setting is present.
#
# 2026-10-17 (D40, review fix): part 1 also fails when the job could turn a
# failing check green without touching the copied check block:
# continue-on-error on the job or the step, any "if:" other than the job's
# "if: always()" (a step "if: false" skips the check), a "shell:" or
# "defaults:" override, a second step, or anything after the
# "# END gates-summary-check" line. Part 1b proves each of those edits is
# rejected, using changed copies of gates.yml.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="$REPO_ROOT/.github/workflows/gates.yml"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

tr -d '\r' < "$WORKFLOW" > "$WORK/gates.yml"

# ---------------------------------------------------------------------------
# Part 1: config of the gates-summary job
# ---------------------------------------------------------------------------
extract_summary_job() {  # extract_summary_job <workflow> <out>
  awk '
    /^  gates-summary:$/ { on = 1; print; next }
    on && /^  [A-Za-z0-9_-]+:$/ { on = 0 }
    on && /^[A-Za-z0-9_-]+:/ { on = 0 }
    on { print }
  ' "$1" > "$2"
}

# config_problems <workflow>: prints one line per problem; status 1 if any.
config_problems() {
  local workflow="$1" job="$WORK/summary-job.yml" problems=0 last
  extract_summary_job "$workflow" "$job"
  need_line() {  # $1 = exact line expected in the job block, $2 = why
    if ! grep -qxF -- "$1" "$job"; then
      echo "missing: $1 ($2)"
      problems=1
    fi
  }
  need_line "    name: All gates passed" "job name must not change (GATE-AMENDMENTS.md hard rule)"
  need_line "    needs: [gate-a, gate-b, gate-c, gate-d, gate-e]" "all five gates must feed the summary"
  need_line "    if: always()" "without it the job is skipped when a gate fails, and a skipped required check counts as passing"
  need_line '          NEEDS_JSON: ${{ toJSON(needs) }}' "the check must read the real job results"
  if grep -qE '^[[:space:]]*(- )?continue-on-error[[:space:]]*:' "$job"; then
    echo "has continue-on-error: a failing check would still show green"
    problems=1
  fi
  if [ "$(grep -cE '^[[:space:]]*(- )?if[[:space:]]*:' "$job")" -ne 1 ]; then
    echo "has an if: besides the job's 'if: always()': a step if: can skip the check"
    problems=1
  fi
  if grep -qE '^[[:space:]]*(- )?shell[[:space:]]*:' "$job" \
     || grep -qE '^[[:space:]]*defaults[[:space:]]*:' "$job" \
     || grep -qE '^defaults[[:space:]]*:' "$workflow"; then
    echo "sets shell: or defaults:: the check must run in the default shell"
    problems=1
  fi
  if [ "$(grep -cE '^      - ' "$job")" -ne 1 ]; then
    echo "does not have exactly one step"
    problems=1
  fi
  last=$(grep -vE '^[[:space:]]*$' "$job" | tail -n 1)
  if [ "$last" != "          # END gates-summary-check" ]; then
    echo "does not end with the '# END gates-summary-check' line: nothing may run after the copied check block"
    problems=1
  fi
  return "$problems"
}

if ! config_out=$(config_problems "$WORK/gates.yml"); then
  echo "FAIL (config): the gates-summary job does not fail closed:"
  echo "$config_out"
  cat "$WORK/summary-job.yml"
  exit 1
fi
echo "OK (config): name, needs, if: always(), NEEDS_JSON, one step, no continue-on-error, no extra if/shell, nothing after END"

# ---------------------------------------------------------------------------
# Part 1b: each edit that could turn a failing summary green is rejected
# ---------------------------------------------------------------------------
STEP_LINE="      - name: Check that every gate job finished with success"
reject_edit() {  # reject_edit <case> <awk program applied to gates.yml>
  awk -v step="$STEP_LINE" "$2" "$WORK/gates.yml" > "$WORK/edited.yml"
  if cmp -s "$WORK/gates.yml" "$WORK/edited.yml"; then
    echo "FAIL ($1): the edit did not change gates.yml, so this case tests nothing"
    exit 1
  fi
  if config_problems "$WORK/edited.yml" > "$WORK/edited.out"; then
    echo "FAIL ($1): the config check accepted a summary job that can pass while a gate failed"
    exit 1
  fi
  echo "OK ($1): rejected ($(head -n 1 "$WORK/edited.out"))"
}
reject_edit "step continue-on-error" '{ print } $0 == step { print "        continue-on-error: true" }'
reject_edit "job continue-on-error" '{ print } $0 == "    if: always()" { print "    continue-on-error: true" }'
reject_edit "step if: false" '{ print } $0 == step { print "        if: false" }'
reject_edit "step shell override" '{ print } $0 == step { print "        shell: bash {0}" }'
reject_edit "workflow defaults" '$0 == "jobs:" { print "defaults:"; print "  run:"; print "    shell: bash {0}"; print "" } { print }'
reject_edit "command after END" '{ print } $0 == "          # END gates-summary-check" { print "          exit 0" }'
reject_edit "second step" '{ print } END { print "      - run: echo extra step" }'

# ---------------------------------------------------------------------------
# Part 2: run the real check block against fixtures
# ---------------------------------------------------------------------------
awk '
  /# BEGIN gates-summary-check/ { match($0, /^ */); indent = RLENGTH; on = 1 }
  on { print substr($0, indent + 1) }
  /# END gates-summary-check/ { on = 0 }
' "$WORK/gates.yml" > "$WORK/check.sh"
if ! grep -q "python3" "$WORK/check.sh" || ! grep -q "END gates-summary-check" "$WORK/check.sh"; then
  echo "FAIL: could not copy the gates-summary-check block out of gates.yml"
  cat "$WORK/check.sh"
  exit 1
fi

job() {  # job <result> [outputs-json]
  printf '{"result":"%s","outputs":%s}' "$1" "${2:-{\}}"
}
needs_json() {  # needs_json <a> <b> <c> <d> <e>  (each already a job object or "")
  local parts=() names=(gate-a gate-b gate-c gate-d gate-e) i=0
  for value in "$@"; do
    [ -n "$value" ] && parts+=("\"${names[$i]}\":$value")
    i=$((i + 1))
  done
  local IFS=,
  printf '{%s}' "${parts[*]}"
}

run_check() {  # run_check <NEEDS_JSON>; sets out + status
  set +e
  out=$(NEEDS_JSON="$1" GITHUB_STEP_SUMMARY="${SUMMARY_FILE:-}" bash "$WORK/check.sh" 2>&1)
  status=$?
  set -e
}

expect_fail() {  # expect_fail <case> <NEEDS_JSON> <text that must appear>
  run_check "$2"
  if [ "$status" -eq 0 ]; then
    echo "FAIL ($1): the summary check passed but must fail"
    echo "$out"
    exit 1
  fi
  if ! grep -qF -- "$3" <<<"$out"; then
    echo "FAIL ($1): the failure message does not contain: $3"
    echo "$out"
    exit 1
  fi
  echo "OK ($1): fails closed"
}

ok_a=$(job success)
ok_b_not_run=$(job success '{"dispatch":""}')
ok_b_ran=$(job success '{"dispatch":"07"}')
ok_c=$(job success)
ok_d_report=$(job success '{"mode":"REPORT"}')
ok_d_blocking=$(job success '{"mode":"BLOCKING"}')
ok_e_report=$(job success '{"mode":"REPORT"}')
ok_e_blocking=$(job success '{"mode":"BLOCKING"}')

expect_fail "gate-b skipped" \
  "$(needs_json "$ok_a" "$(job skipped)" "$ok_c" "$ok_d_report" "$ok_e_report")" \
  "Gate B (gate-b): result is skipped, not success."
expect_fail "gate-c failure" \
  "$(needs_json "$ok_a" "$ok_b_not_run" "$(job failure)" "$ok_d_report" "$ok_e_report")" \
  "Gate C (gate-c): result is failure, not success."
expect_fail "gate-d cancelled" \
  "$(needs_json "$ok_a" "$ok_b_not_run" "$ok_c" "$(job cancelled)" "$ok_e_report")" \
  "Gate D (gate-d): result is cancelled, not success."
expect_fail "gate-e missing" \
  "$(needs_json "$ok_a" "$ok_b_not_run" "$ok_c" "$ok_d_report" "")" \
  "Gate E (gate-e): result is missing, not success."
expect_fail "every gate skipped" \
  "$(needs_json "$(job skipped)" "$(job skipped)" "$(job skipped)" "$(job skipped)" "$(job skipped)")" \
  "Gate A (gate-a): result is skipped, not success."
expect_fail "extra job skipped" \
  "{\"gate-a\":$ok_a,\"gate-b\":$ok_b_not_run,\"gate-c\":$ok_c,\"gate-d\":$ok_d_report,\"gate-e\":$ok_e_report,\"gate-f\":$(job skipped)}" \
  "gate-f (gate-f): result is skipped, not success."
expect_fail "unreadable input" "not json" "could not be read"
expect_fail "empty input" "" "could not be read"
expect_fail "empty object" "{}" "missing or empty"

# All five success, with Gate B, D and E running nothing: passes, says NOT RUN.
SUMMARY_FILE="$WORK/step-summary.md"
: > "$SUMMARY_FILE"
run_check "$(needs_json "$ok_a" "$ok_b_not_run" "$ok_c" "$ok_d_report" "$ok_e_report")"
for wanted in "All 5 gate jobs finished with result success." \
              "Gate B NOT RUN: it only runs on dNN dispatch branches." \
              "Gate D NOT RUN: report mode (MODES.json)." \
              "Gate E NOT RUN: report mode (MODES.json)." \
              "A success here is not evidence for any gate listed as NOT RUN."; do
  if [ "$status" -ne 0 ] || ! grep -qF -- "$wanted" <<<"$out" || ! grep -qF -- "$wanted" "$SUMMARY_FILE"; then
    echo "FAIL (all success, report mode): expected a pass that says: $wanted"
    echo "$out"
    exit 1
  fi
done
echo "OK (all success, report mode): passes and lists Gate B, D and E as NOT RUN"
SUMMARY_FILE=""

# All five success and every gate really ran: passes with no NOT RUN line.
run_check "$(needs_json "$ok_a" "$ok_b_ran" "$ok_c" "$ok_d_blocking" "$ok_e_blocking")"
if [ "$status" -ne 0 ] || grep -qF "NOT RUN" <<<"$out"; then
  echo "FAIL (all success, all ran): expected a clean pass with no NOT RUN line"
  echo "$out"
  exit 1
fi
echo "OK (all success, all ran): passes with no NOT RUN line"
