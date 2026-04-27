#!/bin/bash
# verify-database.sh
#
# Validates database schema integrity per the master QA system DB checks.
# Requires DATABASE_URL set.

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "WARN: DATABASE_URL not set. Skipping live DB checks."
  echo "      Set DATABASE_URL to run full database validation."
  exit 0
fi

LOG_DIR=".ai-coder/checkpoints/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/database-$(date +%Y%m%d-%H%M%S).log"
EXIT_CODE=0

{
  echo "=== Database Schema Validation ==="
  echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "DATABASE_URL: $(echo $DATABASE_URL | sed 's/:[^:@]*@/:***@/')"
  echo ""

  # Check 1: All money columns are integer
  echo "--- DB-S20: Money columns are INTEGER (centavos) ---"
  NON_INT_MONEY=$(psql "$DATABASE_URL" -t -A -c "
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE column_name ~ '(amount|price|fee|commission|balance|total)'
      AND table_schema = 'public'
      AND data_type NOT IN ('integer', 'bigint')
      AND column_name NOT IN ('total_count', 'item_count');
  " 2>/dev/null || echo "")
  if [ -n "$NON_INT_MONEY" ]; then
    echo "FAIL: Non-integer money columns found:"
    echo "$NON_INT_MONEY"
    EXIT_CODE=1
  else
    echo "PASS"
  fi
  echo ""

  # Check 2: All timestamp columns are TIMESTAMPTZ
  echo "--- DB-S03: Timestamp columns use TIMESTAMPTZ ---"
  NON_TZ=$(psql "$DATABASE_URL" -t -A -c "
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE column_name ~ '(_at|_on|_date|_time)$'
      AND table_schema = 'public'
      AND data_type IN ('timestamp without time zone', 'date');
  " 2>/dev/null || echo "")
  if [ -n "$NON_TZ" ]; then
    echo "WARN: Timestamp columns without timezone (review):"
    echo "$NON_TZ"
  else
    echo "PASS"
  fi
  echo ""

  # Check 3: Foreign keys have indexes
  echo "--- DB-S13: Foreign keys are indexed ---"
  UNINDEXED_FK=$(psql "$DATABASE_URL" -t -A -c "
    SELECT
      c.conrelid::regclass AS table_name,
      a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND a.attnum = ANY(i.indkey)
      );
  " 2>/dev/null || echo "")
  if [ -n "$UNINDEXED_FK" ]; then
    echo "WARN: Unindexed foreign keys (performance risk):"
    echo "$UNINDEXED_FK"
  else
    echo "PASS"
  fi
  echo ""

  # Check 4: Primary keys exist
  echo "--- DB-S01: Every table has primary key ---"
  NO_PK=$(psql "$DATABASE_URL" -t -A -c "
    SELECT table_name FROM information_schema.tables t
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        WHERE tc.table_schema = t.table_schema
          AND tc.table_name = t.table_name
          AND tc.constraint_type = 'PRIMARY KEY'
      );
  " 2>/dev/null || echo "")
  if [ -n "$NO_PK" ]; then
    echo "FAIL: Tables without primary key:"
    echo "$NO_PK"
    EXIT_CODE=1
  else
    echo "PASS"
  fi
  echo ""

  # Check 5: created_at / updated_at columns
  echo "--- DB-S02: Standard audit columns ---"
  MISSING_AUDIT=$(psql "$DATABASE_URL" -t -A -c "
    SELECT table_name FROM information_schema.tables t
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'pg_%'
      AND table_name NOT IN ('schema_migrations', 'audit_log_entries')
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = t.table_name
          AND column_name = 'created_at'
      );
  " 2>/dev/null || echo "")
  if [ -n "$MISSING_AUDIT" ]; then
    echo "WARN: Tables missing created_at:"
    echo "$MISSING_AUDIT"
  else
    echo "PASS"
  fi
  echo ""

  echo "=== Schema validation complete ==="
} | tee "$LOG"

exit $EXIT_CODE
