#!/usr/bin/env bash
# Smoke test: the comparison base (BASE_REF) in .github/workflows/gates.yml.
#
# Added 2026-10-14 (D40). The BASE_REF expression is read out of gates.yml and
# evaluated for four events with the same "||" / "&&" rules GitHub uses (they
# return one of their operands, like JavaScript):
#   - pull request          -> the PR base commit
#   - push to master        -> github.event.before (the previous master)
#   - push to master with an all-zero "before" -> origin/master
#   - push to a phase/** branch -> origin/master (unchanged)
# It then proves the check REJECTS the old expression, which used
# origin/master on a push to master (a commit compared with itself).
# This evaluates the expression text, not GitHub itself.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/evaluate.py" <<'PY'
import re
import sys


class Missing:
    """A missing context value: falsy, and every property of it is missing."""
    def __getattr__(self, name):
        return self

    def __bool__(self):
        return False

    def __eq__(self, other):
        return isinstance(other, Missing)

    def __ne__(self, other):
        return not self.__eq__(other)


class Context:
    def __init__(self, values):
        self._values = values

    def __getattr__(self, name):
        value = self._values.get(name, Missing())
        return Context(value) if isinstance(value, dict) else value


def evaluate(expression, github):
    inner = re.fullmatch(r"\$\{\{(.*)\}\}", expression.strip(), re.S)
    if not inner:
        raise SystemExit(f"not a ${{{{ }}}} expression: {expression}")
    body = inner.group(1).replace("&&", " and ").replace("||", " or ")
    if re.search(r"[^\w\s.'()!=/-]", body.replace(" and ", " ").replace(" or ", " ")):
        raise SystemExit(f"unexpected syntax in expression: {body}")
    result = eval(body, {"__builtins__": {}}, {"github": Context(github)})
    return "" if isinstance(result, Missing) else str(result)


def base_ref_line(path):
    for line in open(path, encoding="utf-8"):
        match = re.match(r"^\s*BASE_REF:\s*(.+?)\s*$", line)
        if match:
            return match.group(1)
    raise SystemExit("BASE_REF not found in " + path)


ZERO = "0" * 40
CASES = [
    ("pull request", {"event_name": "pull_request", "ref": "refs/pull/9/merge",
                      "event": {"pull_request": {"base": {"sha": "b" * 40}},
                                "before": ""}}, "b" * 40),
    ("push to master", {"event_name": "push", "ref": "refs/heads/master",
                        "event": {"before": "a" * 40}}, "a" * 40),
    ("push to master, zero before", {"event_name": "push", "ref": "refs/heads/master",
                                     "event": {"before": ZERO}}, "origin/master"),
    ("push to phase branch", {"event_name": "push", "ref": "refs/heads/phase/14-d07-x",
                              "event": {"before": "c" * 40}}, "origin/master"),
]

expression = base_ref_line(sys.argv[1])
failures = []
for name, github, expected in CASES:
    got = evaluate(expression, github)
    if got != expected:
        failures.append(f"{name}: BASE_REF is {got!r}, expected {expected!r}")
if failures:
    print("\n".join(failures))
    sys.exit(1)
print(f"all {len(CASES)} events give the expected comparison base")
PY

tr -d '\r' < "$REPO_ROOT/.github/workflows/gates.yml" > "$WORK/gates.yml"
if ! out=$(python3 "$WORK/evaluate.py" "$WORK/gates.yml" 2>&1); then
  echo "FAIL: the BASE_REF expression in gates.yml gives the wrong comparison base"
  echo "$out"
  exit 1
fi
echo "OK: $out"

# The old expression must be rejected (push to master compared with itself).
sed -E "s#^(\s*BASE_REF:).*#\1 \${{ github.event.pull_request.base.sha || 'origin/master' }}#" \
  "$WORK/gates.yml" > "$WORK/old-gates.yml"
if out_old=$(python3 "$WORK/evaluate.py" "$WORK/old-gates.yml" 2>&1); then
  echo "FAIL: the check accepted the old expression that used origin/master on a push to master"
  echo "$out_old"
  exit 1
fi
if ! grep -qF "push to master: BASE_REF is 'origin/master'" <<<"$out_old"; then
  echo "FAIL: the old expression was rejected for the wrong reason"
  echo "$out_old"
  exit 1
fi
echo "OK: the check rejects the old expression (push to master compared with itself)"
