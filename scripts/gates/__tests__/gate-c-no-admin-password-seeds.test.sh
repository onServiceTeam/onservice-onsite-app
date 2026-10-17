#!/usr/bin/env bash
# Smoke test: Gate C article no-admin-password-seeds
# (scripts/gates/c-constitution-no-admin-password-seeds.sh).
#
# Added 2026-10-17 (D40, BL-23), when the article was wired into
# c-constitution.sh. Before that date nothing ran the script. Proves:
#   A. The original Bug 1235 shape (a one-line UPDATE users SET password_hash)
#      is rejected, with the file named.
#   B. An INSERT INTO users (..., password_hash) over several lines is
#      rejected (the 2026-10-17 tightening; the D01 patterns missed it).
#   C. An UPDATE split over several lines is rejected (same tightening).
#   D. A password_hash line in a non-.sql seed file that matches a D01
#      pattern is rejected (the D01 patterns still scan every file).
#   E. Clean seeds pass: ordinary inserts, and an SQL comment that names the
#      column.
#   F. A seeds folder that cannot be read fails (fail closed).
#   G. Wired through c-constitution.sh: a bad seed is the only BLOCKING
#      failure and fails Gate C; once removed, Gate C passes.
#   H. The real repository's seeds pass.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/gates/c-constitution-no-admin-password-seeds.sh"
WORK=$(mktemp -d)
trap 'chmod -R u+rwx "$WORK" 2>/dev/null || true; rm -rf "$WORK"' EXIT

# run_in <dir>: run the article script with <dir> as the repo root.
run_in() {
  set +e
  out=$(cd "$1" && bash "$SCRIPT" 2>&1)
  status=$?
  set -e
}

# new_seeds <case>: a fresh repo root with an empty seeds folder.
new_seeds() {
  mkdir -p "$WORK/$1/packages/api/seeds"
  echo "$WORK/$1"
}

expect_reject() {  # expect_reject <case> <dir> <text that must appear>...
  local name="$1" dir="$2"
  shift 2
  run_in "$dir"
  if [ "$status" -eq 0 ]; then
    echo "FAIL ($name): the article accepted a seed that sets a password"
    echo "$out"
    exit 1
  fi
  for wanted in "GATE C VIOLATION (Bug 1235)" "$@"; do
    if ! grep -qF -- "$wanted" <<<"$out"; then
      echo "FAIL ($name): the report does not contain: $wanted"
      echo "$out"
      exit 1
    fi
  done
  echo "OK ($name): rejected"
}

# --- A: the original Bug 1235 shape ---
dir=$(new_seeds A)
cat > "$dir/packages/api/seeds/004_admin_passwords.sql" <<'EOF'
-- Seed: set admin passwords
UPDATE users SET password_hash = 'salt:hash' WHERE email = 'admin@example.test';
EOF
expect_reject "A one-line UPDATE" "$dir" "packages/api/seeds/004_admin_passwords.sql:"

# --- B: INSERT over several lines ---
dir=$(new_seeds B)
cat > "$dir/packages/api/seeds/009_staff.sql" <<'EOF'
INSERT INTO users (
  email,
  role,
  password_hash
) VALUES ('staff@example.test', 'admin', 'salt:hash');
EOF
expect_reject "B multi-line INSERT" "$dir" "packages/api/seeds/009_staff.sql:4:"

# --- C: UPDATE over several lines ---
dir=$(new_seeds C)
cat > "$dir/packages/api/seeds/010_reset.sql" <<'EOF'
UPDATE users
   SET password_hash = 'salt:hash'
 WHERE role = 'super_admin';
EOF
expect_reject "C multi-line UPDATE" "$dir" "packages/api/seeds/010_reset.sql:2:"

# --- D: a D01 pattern in a non-.sql seed file ---
dir=$(new_seeds D)
cat > "$dir/packages/api/seeds/seed-admin.ts" <<'EOF'
await db.query("UPDATE users SET password_hash = $1 WHERE email = $2", [hash, email]);
EOF
expect_reject "D D01 pattern in a .ts seed" "$dir" "packages/api/seeds/seed-admin.ts:"

# --- E: clean seeds pass ---
dir=$(new_seeds E)
cat > "$dir/packages/api/seeds/001_categories.sql" <<'EOF'
-- Never write password_hash in a seed; use bootstrap-admin.ts.
INSERT INTO categories (name, slug) VALUES ('Cleaning', 'cleaning');
INSERT INTO users (phone, role) VALUES ('+639170000000', 'customer');
EOF
cat > "$dir/packages/api/seeds/README.md" <<'EOF'
Seeds never set a password. Admin accounts come from bootstrap-admin.ts.
EOF
run_in "$dir"
if [ "$status" -ne 0 ] || ! grep -qF "Gate C — no admin password seeds: OK" <<<"$out"; then
  echo "FAIL (E clean seeds): the article rejected seeds that set no password"
  echo "$out"
  exit 1
fi
echo "OK (E clean seeds): passes, including an SQL comment that names the column"

# --- F: an unreadable seeds folder fails closed ---
# Skipped where permissions do not stop the owner from reading (for example
# when running as root, or on a Windows file system).
dir=$(new_seeds F)
echo "INSERT INTO categories (name) VALUES ('x');" > "$dir/packages/api/seeds/001.sql"
chmod 000 "$dir/packages/api/seeds/001.sql"
if cat "$dir/packages/api/seeds/001.sql" >/dev/null 2>&1; then
  echo "SKIPPED (F unreadable folder): this machine lets the owner read a chmod 000 file, so the case cannot be set up here"
else
  run_in "$dir"
  if [ "$status" -eq 0 ] || ! grep -qF "could not read packages/api/seeds" <<<"$out"; then
    echo "FAIL (F unreadable folder): the article passed when it could not read a seed"
    echo "$out"
    exit 1
  fi
  echo "OK (F unreadable folder): fails closed"
fi
chmod 644 "$dir/packages/api/seeds/001.sql"

# --- G: wired through c-constitution.sh ---
TREE="$WORK/tree"
mkdir -p "$TREE/scripts/gates" "$TREE/packages/api/__tests__" "$TREE/packages/api/src" \
         "$TREE/packages/api/seeds" "$TREE/apps/mobile/src" "$TREE/apps/mobile/app" \
         "$TREE/apps/admin/src" "$TREE/.ai-coder/dispatches"
# Every script Gate C calls, plus MODES.json. (2026-10-17:
# c-db-tests-fail-closed.py added when that article was added.)
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
echo "UPDATE users SET password_hash = 'salt:hash';" > "$TREE/packages/api/seeds/004_admin_passwords.sql"
set +e
out_gate=$(cd "$TREE" && DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1)
status_gate=$?
set -e
if [ "$status_gate" -eq 0 ] \
   || ! grep -qF "Gate C VIOLATION (no-admin-password-seeds) [BLOCKING]" <<<"$out_gate" \
   || ! grep -qF "BLOCKING failed: 1" <<<"$out_gate" \
   || ! grep -qF "Gate C FAILED" <<<"$out_gate"; then
  echo "FAIL (G gate): c-constitution.sh did not fail on a password seed (or another article also failed)"
  echo "$out_gate"
  exit 1
fi
echo "OK (G gate): a password seed fails Gate C as the only BLOCKING failure"

rm -f "$TREE/packages/api/seeds/004_admin_passwords.sql"
echo "INSERT INTO categories (name) VALUES ('Cleaning');" > "$TREE/packages/api/seeds/001_categories.sql"
set +e
out_gate2=$(cd "$TREE" && DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1)
status_gate2=$?
set -e
if [ "$status_gate2" -ne 0 ] \
   || ! grep -qF "no-admin-password-seeds [BLOCKING]: OK" <<<"$out_gate2" \
   || ! grep -qF "Gate C PASSED" <<<"$out_gate2"; then
  echo "FAIL (G gate): Gate C did not pass once the password seed was removed"
  echo "$out_gate2"
  exit 1
fi
echo "OK (G gate): Gate C passes once the seed sets no password"

# --- H: the real repository's seeds ---
run_in "$REPO_ROOT"
if [ "$status" -ne 0 ] || ! grep -qF "Gate C — no admin password seeds: OK" <<<"$out"; then
  echo "FAIL (H real seeds): the repository's own seeds fail the article"
  echo "$out"
  exit 1
fi
echo "OK (H real seeds): the repository's seeds set no password"
