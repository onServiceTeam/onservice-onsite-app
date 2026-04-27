#!/bin/bash
# verify-migrations.sh
#
# Validates migration sequence and clean-DB run.
# Uses node-pg-migrate (the actual migrator in the repo).

set -e

EXIT_CODE=0
MIGRATION_DIR="packages/api/migrations"

if [ ! -d "$MIGRATION_DIR" ]; then
  echo "FAIL: migration dir not found at $MIGRATION_DIR"
  exit 1
fi

# 1. Sequential numbering
echo "--- Checking migration numbering ---"
PREV=0
GAPS=0
for f in $(ls "$MIGRATION_DIR"/[0-9]*.sql | sort); do
  basename=$(basename "$f")
  num=$(echo "$basename" | grep -oE '^[0-9]+' | sed 's/^0*//')
  num=${num:-0}
  expected=$((PREV + 1))
  if [ "$num" != "$expected" ]; then
    echo "GAP/REORDER: expected $(printf '%03d' $expected), got $basename"
    GAPS=$((GAPS + 1))
  fi
  PREV=$num
done
LATEST=$(ls "$MIGRATION_DIR"/[0-9]*.sql | sort | tail -1 | xargs basename)
echo "Latest: $LATEST"
echo "Total: $PREV migrations"
[ $GAPS -gt 0 ] && EXIT_CODE=1

# 2. Migration immutability
echo ""
echo "--- Checking migration immutability ---"
for f in "$MIGRATION_DIR"/[0-9]*.sql; do
  basename=$(basename "$f")
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    if ! git diff --exit-code -- "$f" >/dev/null 2>&1; then
      echo "WARN: $basename has uncommitted changes. Migrations should be append-only."
      echo "      To fix migration $num behavior, write a NEW migration."
    fi
  fi
done

# 3. Live run (only if DATABASE_URL is set)
if [ -n "${DATABASE_URL:-}" ]; then
  echo ""
  echo "--- Live migration test ---"
  echo "DATABASE_URL: $(echo "$DATABASE_URL" | sed 's/:[^:@]*@/:***@/')"

  # Use the actual repo command
  if [ "${RUN_LIVE_MIGRATIONS:-0}" = "1" ]; then
    echo "Running migrate:up via node-pg-migrate..."
    npm run migrate:up --workspace=packages/api 2>&1 || EXIT_CODE=1
  else
    echo "Set RUN_LIVE_MIGRATIONS=1 to actually run migrations against \$DATABASE_URL."
  fi
else
  echo "DATABASE_URL not set; skipping live run."
fi

# 4. Code-vs-schema heuristic
echo ""
echo "--- Code references vs migrations (heuristic) ---"
TABLES=$(grep -hiE "CREATE TABLE( IF NOT EXISTS)?" "$MIGRATION_DIR"/*.sql 2>/dev/null \
  | sed -E 's/.*CREATE TABLE( IF NOT EXISTS)?\s+([a-z_]+).*/\2/i' \
  | sort -u)

USED_TABLES=$(grep -rhEo "FROM\s+[a-z_]+|JOIN\s+[a-z_]+|UPDATE\s+[a-z_]+|INSERT INTO\s+[a-z_]+" packages/api/src 2>/dev/null \
  | awk '{print tolower($NF)}' | sort -u)

for table in $USED_TABLES; do
  if ! echo "$TABLES" | grep -q "^${table}$"; then
    # Common false positives: CTEs, aliases, reserved words
    case "$table" in
      pg_*|information_schema*|generate_series|table|set|values|with)
        ;;
      *)
        echo "WARN: code references '$table' not seen in CREATE TABLE. Verify it's a CTE / alias."
        ;;
    esac
  fi
done

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "PASS: Migration verification clean."
else
  echo ""
  echo "FAIL: Migration verification found issues."
fi

exit $EXIT_CODE
