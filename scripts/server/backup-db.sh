#!/usr/bin/env bash
# scripts/server/backup-db.sh — nightly backup of BOTH the Postgres database and
# the uploaded files (booking photos + KYC docs). Runs on the server via cron.
#
# Produces, under /opt/onservice/backups/:
#   onservice-<TS>.sql.gz   — full pg_dump of the onservice DB, gzipped
#   uploads-<TS>.tgz        — tarball of the uploads_data volume (files on disk)
# Keeps 14 days of each.
#
# OFF-SITE: set BACKUP_RCLONE_REMOTE (e.g. "hetzner-box:onservice-backups") in
# the environment and install rclone to push a copy off the box. Without it,
# backups stay on the same disk as the data — restore the box and you keep your
# data, but a total disk loss loses both. Off-siting is the last durability step
# (needs a destination + credentials from Ken). See docs/runbooks/postgres-restore.md.
set -euo pipefail
umask 077
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

# 2b) Critical config + secrets NOT in git that you need to rebuild the box:
#     .env (DB/JWT/PayMongo secrets), nginx config + .htpasswd, the Let's Encrypt
#     certs, and the compose file. Stays on-box (no worse than the files already
#     on disk); off-sited below when configured. Without this, a host loss means
#     re-issuing every secret + cert by hand (the E08 lesson).
CONFIG_OUT="backups/config-${TS}.tgz"
CONFIG_ITEMS=".env docker-compose.prod.yml nginx/nginx.conf certbot/conf"
[ -f nginx/.htpasswd ] && CONFIG_ITEMS="$CONFIG_ITEMS nginx/.htpasswd"
tar czf "$CONFIG_OUT" -C /opt/onservice $CONFIG_ITEMS 2>/dev/null || true
chmod 600 "$CONFIG_OUT" 2>/dev/null || true  # holds secrets — owner-only

# 2c) Full git history snapshot — one restorable bundle of every branch + tag
#     (belt-and-suspenders beyond the GitHub remote).
GIT_OUT="backups/git-${TS}.bundle"
git bundle create "$GIT_OUT" --all >/dev/null 2>&1 || echo "WARN: git bundle failed" >&2

# 3) Optional off-site copy — the only thing that survives a TOTAL host loss.
#    Set BACKUP_RCLONE_REMOTE + install rclone to push every artifact off the box.
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  for f in "$DB_OUT" "$UPLOADS_OUT" "$CONFIG_OUT" "$GIT_OUT"; do
    [ -s "$f" ] && { rclone copy "$f" "$BACKUP_RCLONE_REMOTE" 2>&1 || echo "WARN: rclone copy failed: $f" >&2; }
  done
fi

# 4) Retain 14 days of each.
find backups -name 'onservice-*.sql.gz' -mtime +14 -delete 2>/dev/null || true
find backups -name 'uploads-*.tgz'      -mtime +14 -delete 2>/dev/null || true
find backups -name 'config-*.tgz'       -mtime +14 -delete 2>/dev/null || true
find backups -name 'git-*.bundle'       -mtime +14 -delete 2>/dev/null || true

echo "$(date -Iseconds) backup OK: db=${DB_OUT} ($(du -h "$DB_OUT" | cut -f1)), uploads=$(du -h "$UPLOADS_OUT" 2>/dev/null | cut -f1 || echo n/a), config=$(du -h "$CONFIG_OUT" 2>/dev/null | cut -f1 || echo n/a), git=$(du -h "$GIT_OUT" 2>/dev/null | cut -f1 || echo n/a)"
