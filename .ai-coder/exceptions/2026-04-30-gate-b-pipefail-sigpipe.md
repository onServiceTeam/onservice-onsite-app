# Exception 2026-04-30 — Gate B SIGPIPE false positive on large CHANGED_TEST_DIFF

**Gate:** Gate B
**Fragment / article:** `scripts/gates/b-bug-deferral.sh` line 88
**Discovered in:** `phase/14-d05-money-trust-closure` PR #16 CI run

## What is flagged

`scripts/gates/b-bug-deferral.sh:88`:

```bash
if ! echo "$CHANGED_TEST_DIFF" | grep -qE "Bug $bug_num"; then
  echo "Gate B FAIL: $bug has no test referencing 'Bug $bug_num' in changed test files"
  fail=1
fi
```

CI run: https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/25149574033/job/73716850990
shows `echo: write error: Broken pipe` immediately before each `Gate B FAIL: Bug NNN has no test...` line, for ALL 12 D05 bugs — even though every bug IS referenced in the changed test files.

## Why the gate is wrong

**False positive.** With `set -euo pipefail` enabled at the top of the script, the pipeline `echo "$LARGE_STRING" | grep -qE PATTERN` exits non-zero whenever:
1. `grep -q` finds the pattern (returns 0).
2. `grep -q` exits early after the first match.
3. `echo` is still writing to the now-closed pipe → SIGPIPE → `echo` returns non-zero.
4. With `pipefail`, the pipeline's exit status is the rightmost non-zero exit, which is `echo`'s — so the pipeline returns non-zero.
5. The `if !` inverts non-zero to zero → the if-block enters → `Gate B FAIL` is logged for a bug whose test reference DOES exist.

This only triggers when `CHANGED_TEST_DIFF` is large enough (the size of the kernel's pipe buffer, typically 64KB). D05's diff is 67KB.

Reproduced locally with a minimal script:
```bash
set -euo pipefail
CHANGED=$(git diff origin/master..HEAD -- '**/*.test.ts')  # 67789 chars in D05
if echo "$CHANGED" | grep -qE "Bug 266"; then echo "FOUND"; else echo "NOT FOUND"; fi
# → "NOT FOUND" (wrong — Bug 266 IS in the diff)
```

Without pipefail OR using a here-string instead of echo:
```bash
set -eu
# OR using here-string with pipefail:
if grep -qE "Bug 266" <<< "$CHANGED"; then ...  # → "FOUND"
```

## Proposed fix

Replace the `echo "$VAR" | grep -q PAT` pattern with `grep -q PAT <<< "$VAR"` (here-string). Here-strings don't go through a real pipe; SIGPIPE doesn't apply.

`scripts/gates/b-bug-deferral.sh:88`:
```diff
-  if ! echo "$CHANGED_TEST_DIFF" | grep -qE "Bug $bug_num"; then
+  if ! grep -qE "Bug $bug_num" <<< "$CHANGED_TEST_DIFF"; then
```

Same applies to line 78 (`echo "$CHANGED_FILES" | grep -q "^$f$"`) for consistency, even though CHANGED_FILES is unlikely to hit the buffer size.

## Smoke test that proves the fix

Manual reproduction confirms:
- Pre-fix: `bash scripts/gates/b-bug-deferral.sh "05"` reports all 12 bugs as NOT FOUND.
- Post-fix: same command reports `Gate B PASSED — all 12 bugs have file diffs and tests`.

A formal smoke test could be added under `scripts/gates/__tests__/` that constructs a >64KB diff and asserts the gate finds bug references in it. Recommend adding in a follow-up dispatch (or as part of D06 gate-hygiene cleanup) — for D05 the manual reproduction + CI re-run after the fix is sufficient evidence.

## What I would have done if forced to bypass

Without this exception, the only alternatives are:
1. Add `// gate-b-bypass:` markers to every test file (no such mechanism exists in the gate; would need to add it).
2. Move all bug-fix tests into a single tiny file < 64KB so the diff stays under the pipe buffer (impractical and breaks test organization).
3. Manually open and re-open the PR repeatedly until the kernel pipe buffer happens to be large enough (flaky and doesn't actually fix anything).

None of those are acceptable. The fix is the right answer.
