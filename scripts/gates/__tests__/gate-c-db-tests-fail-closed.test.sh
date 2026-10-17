#!/usr/bin/env bash
# Smoke test: Gate C article db-tests-fail-closed
# (scripts/gates/c-db-tests-fail-closed.py).
#
# Added 2026-10-17 (D40, AD-09). Proves:
#   A. A database test file with "flag ? it : it.skip" and no CI guard is
#      rejected, with the file, line and flag named.
#   B. A guard on a DIFFERENT flag does not count.
#   C. A commented-out guard does not count.
#   D. A guard that is indented (inside a function, so it may never run) does
#      not count.
#   E. Allowed shapes pass, with exact counts so the pass is not an empty
#      scan: one-line guard, guard with braces, an exported helper flag,
#      describe/test forms, and a skip in a file that never names
#      DATABASE_URL (out of scope).
#   F. With no git repo, the folder-walk fallback still rejects.
#   G. Wired through c-constitution.sh: an unguarded database test is the
#      only BLOCKING failure and fails Gate C; once guarded, Gate C passes.
#   H. The real repository passes.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ARTICLE="$REPO_ROOT/scripts/gates/c-db-tests-fail-closed.py"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# The safety-flag block every case shares (the shape used in packages/api).
FLAG_BLOCK='const databaseUrl = process.env.DATABASE_URL;
const safeDatabase = (() => {
  if (!databaseUrl || process.env.NODE_ENV !== '"'"'test'"'"') return false;
  return new URL(databaseUrl).pathname.endsWith('"'"'_test'"'"');
})();'

# new_case <case> <relative file>  (file content on stdin). Each case is its
# own git repo so the article uses the same "git ls-files" path it uses in CI.
new_case() {
  local dir="$WORK/$1"
  if [ ! -d "$dir/.git" ]; then
    mkdir -p "$dir"
    git -C "$dir" -c init.defaultBranch=main init -q
  fi
  mkdir -p "$dir/$(dirname "$2")"
  cat > "$dir/$2"
}

# expect_reject <case> <text that must appear in the report>...
expect_reject() {
  local name="$1"
  shift
  local out status
  set +e
  out=$(cd "$WORK/$name" && python3 "$ARTICLE" 2>&1)
  status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    echo "FAIL ($name): the article accepted a database test that can skip silently in CI"
    echo "$out"
    exit 1
  fi
  for wanted in "Gate C VIOLATION (db-tests-fail-closed) [BLOCKING]" "$@"; do
    if ! grep -qF -- "$wanted" <<<"$out"; then
      echo "FAIL ($name): the report does not contain: $wanted"
      echo "$out"
      exit 1
    fi
  done
  echo "OK ($name): rejected and reported"
}

# --- A: no guard at all (the shape of the 4 files fixed on 2026-10-17) ---
new_case A packages/api/__tests__/ops-1-schema.test.ts <<EOF
$FLAG_BLOCK

const integrationIt = safeDatabase ? it : it.skip;
integrationIt('Bug OPS-1 - schema works', async () => { expect(await run()).toBe(1); });
EOF
expect_reject A "packages/api/__tests__/ops-1-schema.test.ts:7 DB1" "'safeDatabase ? it : it.skip'"

# --- B: a guard on a different flag ---
new_case B packages/api/__tests__/ops-2.test.ts <<EOF
$FLAG_BLOCK
const otherFlag = true;
if (process.env.CI && !otherFlag) throw new Error('needs the database in CI');
const sqlIt = safeDatabase ? it : it.skip;
EOF
expect_reject B "packages/api/__tests__/ops-2.test.ts:8 DB1" "'safeDatabase ? it : it.skip'"

# --- C: the guard is commented out ---
new_case C packages/api/__tests__/ops-3.test.ts <<EOF
$FLAG_BLOCK
// if (process.env.CI && !safeDatabase) throw new Error('needs the database in CI');
/* if (process.env.CI && !safeDatabase) throw new Error('x'); */
const sqlIt = safeDatabase ? it : it.skip;
EOF
expect_reject C "packages/api/__tests__/ops-3.test.ts:8 DB1"

# --- D: the guard is indented inside a function that may never run ---
new_case D packages/api/__tests__/helpers/ops-4-postgres.ts <<EOF
$FLAG_BLOCK
export function checkCi() {
  if (process.env.CI && !safeDatabase) throw new Error('needs the database in CI');
}
export const ops4It = safeDatabase ? it : it.skip;
EOF
expect_reject D "packages/api/__tests__/helpers/ops-4-postgres.ts:9 DB1"

# --- E: allowed shapes ---
new_case OK packages/api/__tests__/one-line-guard.test.ts <<EOF
$FLAG_BLOCK
if (process.env.CI && !safeDatabase) throw new Error('needs the database in CI');
const sqlIt = safeDatabase ? it : it.skip;
EOF
new_case OK packages/api/__tests__/braces-guard.test.ts <<EOF
$FLAG_BLOCK
if (process.env.CI && !safeDatabase) {
  throw new Error('needs the isolated localhost *_test PostgreSQL service in CI.');
}
const integrationDescribe = safeDatabase ? describe : describe.skip;
const integrationTest = safeDatabase ? test : test.skip;
EOF
new_case OK packages/api/__tests__/helpers/shared-postgres.ts <<EOF
$FLAG_BLOCK
if (process.env.CI && !safeDatabase) {
  throw new Error('needs the database in CI');
}
export const sharedIt = safeDatabase ? it : it.skip;
EOF
# Out of scope: a skip that has nothing to do with the database.
new_case OK apps/mobile/__tests__/platform-skip.test.ts <<'EOF'
const onLinux = process.platform === 'linux';
const linuxIt = onLinux ? it : it.skip;
linuxIt('file modes', () => { expect(mode('x')).toBe(0o755); });
EOF
set +e
out_ok=$(cd "$WORK/OK" && python3 "$ARTICLE" 2>&1)
status_ok=$?
set -e
# 3 database files in scope; flags: safeDatabase in each = 3 guarded flags.
if [ "$status_ok" -ne 0 ] \
   || ! grep -qF "db-tests-fail-closed [BLOCKING]: OK (3 database test file(s) with a skip, 3 skip flag(s), all guarded; 4 source files scanned)" <<<"$out_ok"; then
  echo "FAIL (E allowed): the article rejected a guarded database test (false positive) or miscounted"
  echo "$out_ok"
  exit 1
fi
echo "OK (E allowed): one-line and braced guards, helper flags, describe/test forms and non-database skips pass"

# --- F: no git repo; the folder-walk fallback must still reject ---
mkdir -p "$WORK/F/packages/api/__tests__"
printf '%s\nconst sqlIt = safeDatabase ? it : it.skip;\n' "$FLAG_BLOCK" > "$WORK/F/packages/api/__tests__/no-git.test.ts"
set +e
out_f=$(cd "$WORK/F" && GIT_DIR="$WORK/F/not-a-repo" python3 "$ARTICLE" 2>&1)
status_f=$?
set -e
if [ "$status_f" -eq 0 ] || ! grep -qF "packages/api/__tests__/no-git.test.ts:6 DB1" <<<"$out_f"; then
  echo "FAIL (F): the folder-walk fallback did not reject the unguarded database test"
  echo "$out_f"
  exit 1
fi
echo "OK (F): rejected without git (folder-walk fallback)"

# --- G: wired through c-constitution.sh ---
TREE="$WORK/tree"
mkdir -p "$TREE/scripts/gates" "$TREE/packages/api/__tests__" "$TREE/packages/api/src" \
         "$TREE/apps/mobile/src" "$TREE/apps/mobile/app" "$TREE/apps/admin/src" \
         "$TREE/.ai-coder/dispatches"
# Every script Gate C calls, plus MODES.json.
for f in c-constitution.sh MODES.json get-mode.py mode-lookup.sh c-no-fake-tests.py \
         c-unique-regression-ids.py c-constitution-no-shield-references.sh \
         c-constitution-no-admin-password-seeds.sh c-db-tests-fail-closed.py; do
  cp "$REPO_ROOT/scripts/gates/$f" "$TREE/scripts/gates/"
done
# Article 12 counts lines that start with test( or it(, so one per line.
cat > "$TREE/packages/api/__tests__/bigint-money-precision.test.ts" <<'EOF'
test('1', () => {});
test('2', () => {});
test('3', () => {});
test('4', () => {});
test('5', () => {});
EOF
echo "<!-- gate-b: no-bugs-this-dispatch -->" > "$TREE/.ai-coder/dispatches/D99-closeout.md"
printf '%s\nconst sqlIt = safeDatabase ? it : it.skip;\n' "$FLAG_BLOCK" > "$TREE/packages/api/__tests__/db.test.ts"
set +e
out_gate=$(cd "$TREE" && DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1)
status_gate=$?
set -e
if [ "$status_gate" -eq 0 ] \
   || ! grep -qF "Gate C VIOLATION (db-tests-fail-closed) [BLOCKING]" <<<"$out_gate" \
   || ! grep -qF "BLOCKING failed: 1" <<<"$out_gate" \
   || ! grep -qF "Gate C FAILED" <<<"$out_gate"; then
  echo "FAIL (G gate): c-constitution.sh did not fail on an unguarded database test (or another article also failed)"
  echo "$out_gate"
  exit 1
fi
echo "OK (G gate): an unguarded database test fails Gate C as the only BLOCKING failure"

printf '%s\nif (process.env.CI && !safeDatabase) throw new Error("needs the database in CI");\nconst sqlIt = safeDatabase ? it : it.skip;\n' \
  "$FLAG_BLOCK" > "$TREE/packages/api/__tests__/db.test.ts"
set +e
out_gate2=$(cd "$TREE" && DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1)
status_gate2=$?
set -e
if [ "$status_gate2" -ne 0 ] \
   || ! grep -qE "db-tests-fail-closed \[BLOCKING\]: OK" <<<"$out_gate2" \
   || ! grep -qF "Gate C PASSED" <<<"$out_gate2"; then
  echo "FAIL (G gate): Gate C did not pass once the database test was guarded"
  echo "$out_gate2"
  exit 1
fi
echo "OK (G gate): Gate C passes once the database test is guarded"

# --- H: the real repository ---
set +e
out_h=$(cd "$REPO_ROOT" && python3 "$ARTICLE" 2>&1)
status_h=$?
set -e
if [ "$status_h" -ne 0 ] || ! grep -qF "db-tests-fail-closed [BLOCKING]: OK" <<<"$out_h"; then
  echo "FAIL (H real repo): the repository's own database tests fail the article"
  echo "$out_h"
  exit 1
fi
echo "OK (H real repo): $out_h"
