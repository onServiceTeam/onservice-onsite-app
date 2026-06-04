#!/usr/bin/env bash
# scripts/server/backup-db.sh — nightly backup of BOTH the Postgres database and
# the uploaded files (booking photos + KYC docs). Runs on the server via cron.
#
# Produces, under /opt/onservice/backups/:
#   onservice-<TS>.sql.gz   — full pg_dump of the onservice DB, gzipped
#   uploads-<TS>.tgz        — tarball of the uploads_data volume (files on disk)
# Keeps 7 days of each.
#
# OFF-SITE: set BACKUP_RCLONE_REMOTE (e.g. "hetzner-box:onservice-backups") in
# the environment and install rclone to push a copy off the box. Without it,
# backups stay on the same disk as the data — restore the box and you keep your
# data, but a total disk loss loses both. Off-siting is the last durability step
# (needs a destination + credentials from Ken). See docs/runbooks/postgres-restore.md.
set -euo pipefail
cd /opt/onservice
mkdir -p backups
TS="$(date +%Y%m%d-%H%M%S)"

DB_OUT="backups/onservice-${TS}.sql.gz"
UPLOADS_OUT="backups/uploads-${TS}.tgz"

# 1) Database — dump from the postgres container, gzip. Fail loudly (pipefail)
#    if pg_dump errors so a broken dump never silently replaces good ones.
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U onservice_user -d onservice | gzip > "$DB_OUT"
if [ ! -s "$DB_OUT" ]; then
  echo "ERROR: DB dump is empty — aborting" >&2
  rm -f "$DB_OUT"
  exit 1
fi

# 2) Uploads — tar the named volume's contents via a throwaway alpine container
#    (the volume is not mounted on the host shell). Read-only mount.
docker run --rm \
  -v onservice_uploads_data:/data:ro \
  -v /opt/onservice/backups:/backup \
  alpine tar czf "/backup/uploads-${TS}.tgz" -C /data . 2>/dev/null || true
# An empty uploads volume yields a tiny-but-valid tar; that's fine pre-launch.

# 3) Optional off-site copy.
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$DB_OUT" "$BACKUP_RCLONE_REMOTE" 2>&1 || echo "WARN: rclone DB copy failed" >&2
  rclone copy "$UPLOADS_OUT" "$BACKUP_RCLONE_REMOTE" 2>&1 || echo "WARN: rclone uploads copy failed" >&2
fi

# 4) Retain 7 days of each.
find backups -name 'onservice-*.sql.gz' -mtime +7 -delete 2>/dev/null || true
find backups -name 'uploads-*.tgz'      -mtime +7 -delete 2>/dev/null || true

echo "$(date -Iseconds) backup OK: ${DB_OUT} ($(du -h "$DB_OUT" | cut -f1)), ${UPLOADS_OUT} ($(du -h "$UPLOADS_OUT" 2>/dev/null | cut -f1 || echo n/a))"
