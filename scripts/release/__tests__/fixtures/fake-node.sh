#!/usr/bin/env bash
# TEST DOUBLE for scripts/release/__tests__ only. Stands in for
# scripts/run-reviewed-migrations.mjs inside the fake API container. It prints
# the same summary lines as the real runner and updates the fake migration count.
db="${DATABASE_URL##*/}"
printf 'node db=%s args=%s\n' "$db" "$*" >> "$FAKE_LOG"
[ "${1:-}" = scripts/run-reviewed-migrations.mjs ] || exit 64
shift
target="" dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target) target="$2"; shift 2;;
    --migrations-dir) shift 2;;
    --dry-run) dry=1; shift;;
    *) echo "Reviewed migrations failed: Unsupported migration runner argument."; exit 1;;
  esac
done
f="$FAKE_STATE/db/$db.count"
[ -f "$f" ] || { echo "Reviewed migrations failed: no such database"; exit 1; }
cur="$(cat "$f")"
after="$FAKE_AFTER_COUNT"
pending=$((after - cur))
# A runner that still finds work on the repeat run must stop the release.
if [ "${FAKE_SCENARIO:-}" = rehearsal_repeat_pending ] && [ "$db" != onservice ] && [ "$pending" = 0 ]; then pending=1; fi
echo "Reviewed migration boundary: $target; $pending pending file(s)."
if [ "$dry" = 1 ]; then echo "Reviewed migration dry run complete; no pending migration marked applied."; exit 0; fi
s="${FAKE_SCENARIO:-success}"
if [ "$db" = onservice ]; then
  [ "$s" != live_migration_fails ] || { echo "Reviewed migrations failed: fixture failure"; exit 1; }
else
  [ "$s" != rehearsal_apply_fails ] || { echo "Reviewed migrations failed: fixture failure"; exit 1; }
  [ "$s" != rehearsal_short ] || after=$((after - 1))
fi
echo "$after" > "$f"
echo "$target" > "$FAKE_STATE/db/$db.target"
echo "Reviewed migrations verified through $target; $after applied."
