#!/usr/bin/env bash
# Gate C article "no-admin-password-seeds": no seed file may set a password.
#
# Bug 1235 (Phase 14 Dispatch 01) fix. The deleted seed
# 004_admin_passwords.sql set password_hash on the admin rows of the users
# table, which is where admin passwords live (migration 017). A seed like that
# invites someone to paste a real hash of a known password. Admin accounts are
# made with packages/api/scripts/bootstrap-admin.ts instead.
#
# Wired into scripts/gates/c-constitution.sh as a BLOCKING article on
# 2026-10-17 (D40, backlog item BL-23). Before that date no workflow and no
# gate runner called this script, so it checked nothing in CI. Mode:
# scripts/gates/MODES.json, gate_c_articles.no-admin-password-seeds.
# Self-test: scripts/gates/__tests__/gate-c-no-admin-password-seeds.test.sh.
# This file is a gate script. Changing it follows the gate-change rule in
# .ai-coder/governance/GATE-AMENDMENTS.md.
#
# WHAT IT REJECTS (letter case ignored), under packages/api/seeds/:
#   1. In any file: the D01 patterns, unchanged. A one-line UPDATE of users or
#      admin_users that names password_hash; "admin_users ... password_hash =";
#      "users SET password_hash". A line holding "// gate-c-allowed:" is
#      skipped, as before.
#   2. Added 2026-10-17 (tightening only): in any .sql file, any line that
#      names password_hash, unless the line is an SQL comment (it starts
#      with --). This also catches an INSERT INTO users (..., password_hash)
#      and an UPDATE written over several lines, which pattern 1 misses.
#      There is no allow marker for this pattern. A false positive goes
#      through the gate-change rule.
#   A folder that cannot be read fails the check (fail closed).
#
# LIMITS (stated plainly)
#   - It reads text line by line. It does not parse SQL, so a column name
#     built at run time is not seen.
#   - It reads packages/api/seeds/ only. A seed kept anywhere else is not seen.
#   - With no packages/api/seeds/ folder at all it prints "skipped" and
#     exits 0, because there is nothing to check.

set -euo pipefail

SEEDS_DIR="packages/api/seeds"

if [ ! -d "$SEEDS_DIR" ]; then
  echo "Gate C — no admin password seeds: skipped (no seeds directory)"
  exit 0
fi

# run_grep <output variable> <grep arguments...>: grep exit 1 means "no
# match"; anything above 1 means the folder could not be read, which fails.
run_grep() {
  local __out="$1" __status=0 __result
  shift
  __result=$(grep "$@") || __status=$?
  if [ "$__status" -gt 1 ]; then
    echo "GATE C VIOLATION (Bug 1235): could not read $SEEDS_DIR (grep exit $__status)."
    exit 1
  fi
  printf -v "$__out" '%s' "$__result"
}

# Pattern 1 (D01, unchanged).
run_grep pattern_one -rEi \
  "UPDATE\s+(users|admin_users)[^;]*password_hash|admin_users[^;]*password_hash\s*=|users\s+SET\s+password_hash" \
  "$SEEDS_DIR/"
violations=$(printf '%s\n' "$pattern_one" | grep -v "// gate-c-allowed:" | grep -v '^$' || true)

# Pattern 2 (2026-10-17): any non-comment line of a .sql seed naming the
# column. grep -n prints "path:line:text"; a comment line has "--" as the
# first text after the line number.
run_grep pattern_two -rniE --include='*.sql' "password_hash" "$SEEDS_DIR/"
sql_violations=$(printf '%s\n' "$pattern_two" | grep -vE '^[^:]+:[0-9]+:[[:space:]]*--' | grep -v '^$' || true)

if [ -n "$violations" ] || [ -n "$sql_violations" ]; then
  echo "GATE C VIOLATION (Bug 1235): seed files must never set a password (password_hash)."
  echo "Create admin accounts with packages/api/scripts/bootstrap-admin.ts and the ADMIN_BOOTSTRAP_PASSWORD env var instead."
  [ -n "$violations" ] && echo "$violations"
  [ -n "$sql_violations" ] && echo "$sql_violations"
  exit 1
fi

echo "Gate C — no admin password seeds: OK"
