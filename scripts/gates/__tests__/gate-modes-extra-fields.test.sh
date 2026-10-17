#!/usr/bin/env bash
# Smoke test: MODES.json readers ignore extra fields, and the real MODES.json
# carries the approval fields.
#
# Added 2026-10-14 (D40), when approved_by and reviewed_on were added to every
# MODES.json entry. Proves:
#   A. get-mode.py still returns the right mode when entries (and the top
#      level) carry extra fields, and still fails closed to BLOCKING for an
#      unknown entry or a bad mode value.
#   B. run-gate-a.sh and c-constitution.sh still honor BLOCKING and REPORT
#      with those extra fields present.
#   C. The jq read used by gates.yml for Gate D and Gate E still works (only
#      where jq is installed; GitHub's Ubuntu runners have it).
#   D. The real scripts/gates/MODES.json: every entry has a valid mode and
#      non-empty approved_by and reviewed_on, get-mode.py returns each entry's
#      declared mode, and the same validator REJECTS a file with a missing
#      approved_by or an invalid mode.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/scripts/gates"
for f in get-mode.py mode-lookup.sh run-gate-a.sh c-constitution.sh; do
  cp "$REPO_ROOT/scripts/gates/$f" "$WORK/scripts/gates/"
done

cat > "$WORK/scripts/gates/MODES.json" <<'EOF'
{
  "_schema_version": 1,
  "_fields": { "approved_by": "doc", "reviewed_on": "doc" },
  "_future_top_level": [1, 2, 3],
  "gate_a_fragments": {
    "a-cross-source-synthetic-blocking": {
      "mode": "BLOCKING", "owning_dispatch": "test", "rationale": "smoke",
      "approved_by": "Ken", "reviewed_on": "2026-10-14",
      "future_field": { "nested": ["x"] }
    },
    "a-cross-source-synthetic-report": {
      "mode": "REPORT", "owning_dispatch": "test", "rationale": "smoke",
      "approved_by": "unknown before 2026-10-14", "reviewed_on": "unknown before 2026-10-14",
      "future_field": 7
    },
    "a-cross-source-bad-mode": {
      "mode": "report", "owning_dispatch": "test", "rationale": "lower-case is not a valid mode",
      "approved_by": "x", "reviewed_on": "y"
    }
  },
  "gate_c_articles": {
    "article-4.2-no-console": {
      "mode": "REPORT", "owning_dispatch": "test", "rationale": "smoke",
      "approved_by": "x", "reviewed_on": "y", "future_field": true
    }
  },
  "gate_d_state": {
    "mode": "REPORT", "owning_dispatch": "test", "promoted_in": null, "rationale": "smoke",
    "approved_by": "unknown before 2026-10-14", "reviewed_on": "unknown before 2026-10-14",
    "future_field": null
  }
}
EOF

cd "$WORK"
lookup() { bash scripts/gates/mode-lookup.sh "$1" "$2"; }

# --- A: get-mode.py with extra fields ---
check_mode() {  # check_mode <category> <key> <expected>
  local got
  got=$(lookup "$1" "$2")
  if [ "$got" != "$3" ]; then
    echo "FAIL (A): $1/$2 read as '$got', expected '$3'"
    exit 1
  fi
}
check_mode gate_a_fragments a-cross-source-synthetic-blocking BLOCKING
check_mode gate_a_fragments a-cross-source-synthetic-report REPORT
check_mode gate_a_fragments a-cross-source-bad-mode BLOCKING
check_mode gate_a_fragments a-cross-source-not-listed BLOCKING
check_mode gate_c_articles article-4.2-no-console REPORT
check_mode gate_d_state state REPORT
echo "OK (A): get-mode.py ignores extra fields and still fails closed"

# --- B1: run-gate-a.sh honors modes with extra fields ---
printf '#!/usr/bin/env bash\necho "synthetic REPORT failure"\nexit 1\n' > scripts/gates/a-cross-source-synthetic-report.sh
printf '#!/usr/bin/env bash\nexit 0\n' > scripts/gates/a-cross-source-synthetic-blocking.sh
printf '#!/usr/bin/env bash\nexit 0\n' > scripts/gates/a-cross-source-bad-mode.sh
out=$(bash scripts/gates/run-gate-a.sh 2>&1 || true)
if ! grep -q "Gate A PASSED" <<<"$out"; then
  echo "FAIL (B1): a failing REPORT fragment with extra fields failed Gate A"
  echo "$out"
  exit 1
fi
printf '#!/usr/bin/env bash\necho "synthetic BLOCKING failure"\nexit 1\n' > scripts/gates/a-cross-source-synthetic-blocking.sh
out=$(bash scripts/gates/run-gate-a.sh 2>&1 || true)
if ! grep -q "Gate A FAILED" <<<"$out"; then
  echo "FAIL (B1): a failing BLOCKING fragment with extra fields did not fail Gate A"
  echo "$out"
  exit 1
fi
printf '#!/usr/bin/env bash\nexit 0\n' > scripts/gates/a-cross-source-synthetic-blocking.sh
printf '#!/usr/bin/env bash\necho "bad-mode failure"\nexit 1\n' > scripts/gates/a-cross-source-bad-mode.sh
out=$(bash scripts/gates/run-gate-a.sh 2>&1 || true)
if ! grep -q "Gate A FAILED" <<<"$out"; then
  echo "FAIL (B1): a fragment with an invalid mode value was not treated as BLOCKING"
  echo "$out"
  exit 1
fi
echo "OK (B1): run-gate-a.sh honors BLOCKING, REPORT and the fail-closed default with extra fields"

# --- B2: c-constitution.sh reads the article mode with extra fields ---
mkdir -p apps/mobile/src apps/mobile/app apps/admin/src packages/api/src packages/api/__tests__ .ai-coder/dispatches
echo "console.log('synthetic violation');" > apps/mobile/src/bad.ts
echo "<!-- gate-b: no-bugs-this-dispatch -->" > .ai-coder/dispatches/D99-closeout.md
out=$(DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1 || true)
if ! grep -qF "article-4.2-no-console [REPORT]: violations logged" <<<"$out"; then
  echo "FAIL (B2): c-constitution.sh did not read REPORT for an article with extra fields"
  echo "$out"
  exit 1
fi
python3 - <<'PY'
import json
from pathlib import Path
path = Path("scripts/gates/MODES.json")
data = json.loads(path.read_text(encoding="utf-8"))
data["gate_c_articles"]["article-4.2-no-console"]["mode"] = "BLOCKING"
path.write_text(json.dumps(data, indent=2), encoding="utf-8")
PY
out=$(DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1 || true)
if ! grep -qF "Gate C VIOLATION (article-4.2-no-console) [BLOCKING]" <<<"$out"; then
  echo "FAIL (B2): c-constitution.sh did not read BLOCKING for an article with extra fields"
  echo "$out"
  exit 1
fi
echo "OK (B2): c-constitution.sh honors REPORT and BLOCKING with extra fields"

# --- C: the jq read used by gates.yml ---
if command -v jq >/dev/null 2>&1; then
  got=$(jq -r '.gate_d_state.mode' scripts/gates/MODES.json)
  if [ "$got" != "REPORT" ]; then
    echo "FAIL (C): jq read gate_d_state.mode as '$got'"
    exit 1
  fi
  got=$(jq -r '.gate_d_state.mode' "$REPO_ROOT/scripts/gates/MODES.json")
  if [ "$got" != "REPORT" ] && [ "$got" != "BLOCKING" ]; then
    echo "FAIL (C): jq read the real gate_d_state.mode as '$got'"
    exit 1
  fi
  echo "OK (C): jq reads gate_d_state.mode with extra fields present"
else
  echo "SKIPPED (C): jq is not installed on this machine, so the gates.yml jq read was not checked here. GitHub's Ubuntu runners have jq."
fi

# --- D: the real MODES.json ---
cat > "$WORK/validate.py" <<'PY'
"""Check every MODES.json entry has a valid mode and the approval fields."""
import json
import sys

path = sys.argv[1]
data = json.load(open(path, encoding="utf-8"))
entries = []
for category in ("gate_a_fragments", "gate_c_articles"):
    block = data.get(category)
    if not isinstance(block, dict) or not block:
        print(f"{category} is missing or empty")
        sys.exit(1)
    entries += [(f"{category}/{key}", value) for key, value in block.items()]
for state in ("gate_d_state", "gate_e_state"):
    entries.append((state, data.get(state)))
problems = []
for name, entry in entries:
    if not isinstance(entry, dict):
        problems.append(f"{name}: not an object")
        continue
    if entry.get("mode") not in ("BLOCKING", "REPORT"):
        problems.append(f"{name}: mode is {entry.get('mode')!r}")
    for field in ("approved_by", "reviewed_on"):
        value = entry.get(field)
        if not isinstance(value, str) or not value.strip():
            problems.append(f"{name}: {field} is missing or empty")
if problems:
    print("\n".join(problems))
    sys.exit(1)
for name, entry in entries:
    print(f"{name}\t{entry['mode']}")
PY

if ! real_entries=$(python3 "$WORK/validate.py" "$REPO_ROOT/scripts/gates/MODES.json"); then
  echo "FAIL (D): the real MODES.json does not pass the field check"
  echo "$real_entries"
  exit 1
fi
count=0
while IFS=$'\t' read -r name declared; do
  declared="${declared%$'\r'}"  # Windows Python writes CRLF to pipes
  [ -z "$name" ] && continue
  category="${name%%/*}"
  key="${name#*/}"
  [ "$category" = "$name" ] && key="state"
  got=$(bash "$REPO_ROOT/scripts/gates/mode-lookup.sh" "$category" "$key")
  if [ "$got" != "$declared" ]; then
    echo "FAIL (D): get-mode.py read $name as '$got' but MODES.json declares '$declared'"
    exit 1
  fi
  count=$((count + 1))
done <<<"$real_entries"
echo "OK (D): the real MODES.json has valid modes and approval fields on all $count entries, and get-mode.py reads each one correctly"

python3 - "$REPO_ROOT/scripts/gates/MODES.json" "$WORK" <<'PY'
import json
import sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
missing = json.loads(json.dumps(data))
first = next(iter(missing["gate_c_articles"]))
del missing["gate_c_articles"][first]["approved_by"]
json.dump(missing, open(f"{sys.argv[2]}/missing-approved-by.json", "w", encoding="utf-8"))
bad_mode = json.loads(json.dumps(data))
bad_mode["gate_e_state"]["mode"] = "SOFT"
json.dump(bad_mode, open(f"{sys.argv[2]}/bad-mode.json", "w", encoding="utf-8"))
PY
for bad in missing-approved-by bad-mode; do
  if python3 "$WORK/validate.py" "$WORK/$bad.json" >/dev/null 2>&1; then
    echo "FAIL (D): the field check accepted a broken MODES.json ($bad)"
    exit 1
  fi
done
echo "OK (D): the field check rejects a missing approved_by and an invalid mode"
