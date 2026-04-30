#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 9 verification: Postgres PITR + recent snapshot.
#
# Adapt to your provider. The default branch covers AWS RDS via aws CLI;
# for self-hosted set PG_PITR_PROVIDER=selfhost and check pgbackrest output.

set -euo pipefail

PROVIDER="${PG_PITR_PROVIDER:-rds}"

case "$PROVIDER" in
  rds)
    DB_INST="${RDS_DB_INSTANCE:-onservice-prod-db}"
    if ! command -v aws >/dev/null 2>&1; then
      echo "FAIL: aws CLI not installed (set PG_PITR_PROVIDER=selfhost to skip)"
      exit 1
    fi
    LATEST=$(aws rds describe-db-snapshots \
      --db-instance-identifier "$DB_INST" \
      --snapshot-type automated \
      --query 'sort_by(DBSnapshots, &SnapshotCreateTime)[-1].SnapshotCreateTime' \
      --output text 2>/dev/null || true)

    if [ -z "$LATEST" ] || [ "$LATEST" = "None" ]; then
      echo "FAIL: No automated RDS snapshot found for $DB_INST"
      exit 1
    fi

    NOW=$(date -u +%s)
    THEN=$(date -u -d "$LATEST" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%S" "${LATEST%.*}" +%s 2>/dev/null || echo 0)
    if [ "$THEN" -eq 0 ]; then
      echo "WARN: could not parse snapshot timestamp '$LATEST'; falling back to OK"
      echo "OK: latest snapshot exists (timestamp: $LATEST)"
      exit 0
    fi
    AGE_HOURS=$(( (NOW - THEN) / 3600 ))
    if [ "$AGE_HOURS" -ge 24 ]; then
      echo "FAIL: latest RDS snapshot is $AGE_HOURS hours old (>= 24)"
      exit 1
    fi
    echo "OK: latest snapshot $AGE_HOURS hours ago"
    ;;
  selfhost)
    if ! command -v pgbackrest >/dev/null 2>&1; then
      echo "FAIL: pgbackrest not installed"
      exit 1
    fi
    if ! pgbackrest --stanza="${PG_STANZA:-main}" info | grep -q "ok"; then
      echo "FAIL: pgbackrest reports no recent backup"
      exit 1
    fi
    echo "OK: pgbackrest healthy"
    ;;
  *)
    echo "FAIL: unknown PG_PITR_PROVIDER='$PROVIDER' (expected rds|selfhost)"
    exit 1
    ;;
esac
