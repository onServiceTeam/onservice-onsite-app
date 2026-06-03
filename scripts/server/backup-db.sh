#!/usr/bin/env bash
# scripts/server/backup-db.sh — nightly Postgres backup. Run on the server.
# Dumps the DB from the postgres container, gzips it, keeps 7 days.
# Off-site copy (S3/Storage Box) is added at the production cutover.
set -euo pipefail
cd /opt/onservice
mkdir -p backups
TS="$(date +%Y%m%d-%H%M%S)"
OUT="backups/onservice-${TS}.sql.gz"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U onservice_user -d onservice | gzip > "$OUT"
# Retain 7 days of daily backups.
find backups -name 'onservice-*.sql.gz' -mtime +7 -delete 2>/dev/null || true
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"
