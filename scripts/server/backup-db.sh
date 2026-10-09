#!/usr/bin/env bash
# scripts/server/backup-db.sh — nightly backup of BOTH the Postgres database and
# the uploaded files (booking photos + KYC docs). Runs on the server via cron.
#
# Produces a database dump, uploads archive, private configuration archive,
# git bundle, and backup-<TS>.complete checksum manifest. Only a complete set
# permits success or retention. Failed runs retain private .incomplete-* files
# for investigation and never prune existing backups. Keeps 14 days of each.
#
# OFF-SITE: set BACKUP_RCLONE_REMOTE (e.g. "hetzner-box:onservice-backups") in
# the environment and install rclone to push a copy off the box. Without it,
# these logical backups stay on the same disk as the live data. This script
# does not verify provider snapshots, PITR, or successful database restoration.
# See docs/runbooks/postgres-restore.md.
set -Eeuo pipefail
umask 077
PROJECT_DIR="${ONSERVICE_PROJECT_DIR:-/opt/onservice}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
RCLONE_BIN="${RCLONE_BIN:-rclone}"
cd "$PROJECT_DIR"
PROJECT_DIR="$(pwd -P)"

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ "$PROJECT_DIR" != / && -d .git ]] || fail "Expected an onService checkout, not a filesystem root."
[[ ! -L backups ]] || fail "Refusing a symlinked backup directory."
[[ "${BACKUP_SKIP_RETENTION:-0}" =~ ^[01]$ ]] || fail "BACKUP_SKIP_RETENTION must be 0 or 1."
for item in .env docker-compose.prod.yml nginx/nginx.conf certbot/conf; do
  [[ -e "$item" ]] || fail "Required backup source is missing: $item"
done
if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  command -v "$RCLONE_BIN" >/dev/null || fail "Off-site copying is configured but rclone is unavailable."
fi

mkdir -p backups
BACKUP_DIR="$PROJECT_DIR/backups"
# One run at a time, including cron/deployment overlap. Never remove another
# run's lock. A SIGKILL/host crash requires an operator to check a stale lock.
mkdir "$BACKUP_DIR/.backup-lock" 2>/dev/null || fail "Another backup is active, or its lock needs review."
STAGE_DIR=""
finish() {
  local status=$?
  trap - EXIT
  # The successful path disarms this trap only after publishing and retention.
  # Premature EOF/exit 0 must not masquerade as a completed recovery set.
  [[ "$status" -ne 0 ]] || status=1
  echo "ERROR: backup failed; no success reported. Private staging: ${STAGE_DIR:-not created}" >&2
  rmdir "$BACKUP_DIR/.backup-lock" || status=1
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
TS="$(date +%Y%m%d-%H%M%S)"
ARTIFACTS=("onservice-${TS}.sql.gz" "uploads-${TS}.tgz" "config-${TS}.tgz" "git-${TS}.bundle")
MANIFEST="backup-${TS}.complete"
for name in "${ARTIFACTS[@]}" "$MANIFEST"; do
  [[ ! -e "$BACKUP_DIR/$name" ]] || fail "Backup timestamp collision; refusing to overwrite $name."
done
STAGE_DIR="$(mktemp -d "$BACKUP_DIR/.incomplete-${TS}-XXXXXX")"

# Inspect first: Docker otherwise creates an empty named volume when a mount
# is misspelled or missing, yielding a valid archive of the wrong empty data.
"$DOCKER_BIN" volume inspect onservice_uploads_data >/dev/null

# 1) Database. Consume the full stream so gzip/pg_dump errors cannot be hidden
# by an early-closing reader. This is integrity validation, not a restore test.
"$DOCKER_BIN" compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U onservice_user -d onservice </dev/null | gzip > "$STAGE_DIR/${ARTIFACTS[0]}"
gzip -t "$STAGE_DIR/${ARTIFACTS[0]}"
gzip -cd "$STAGE_DIR/${ARTIFACTS[0]}" | awk 'NF { seen=1 } END { exit !seen }'

# 2) Uploads, read-only. A genuinely empty pre-launch volume is valid.
"$DOCKER_BIN" run --rm \
  -v onservice_uploads_data:/data:ro \
  -v "$STAGE_DIR:/backup" \
  alpine tar czf "/backup/${ARTIFACTS[1]}" -C /data .
tar tzf "$STAGE_DIR/${ARTIFACTS[1]}" >/dev/null

# 3) Critical private configuration. Do not print archive contents or secrets.
CONFIG_ITEMS=(.env docker-compose.prod.yml nginx/nginx.conf certbot/conf)
[[ ! -f nginx/.htpasswd ]] || CONFIG_ITEMS+=(nginx/.htpasswd)
tar czf "$STAGE_DIR/${ARTIFACTS[2]}" -C "$PROJECT_DIR" "${CONFIG_ITEMS[@]}"
tar tzf "$STAGE_DIR/${ARTIFACTS[2]}" >/dev/null

# 4) Git history, with verification rather than a best-effort warning.
git bundle create "$STAGE_DIR/${ARTIFACTS[3]}" --all >/dev/null
git bundle verify "$STAGE_DIR/${ARTIFACTS[3]}" >/dev/null 2>&1
for name in "${ARTIFACTS[@]}"; do
  [[ -s "$STAGE_DIR/$name" ]] || fail "Backup artifact is empty: $name"
  chmod 600 "$STAGE_DIR/$name"
done
(cd "$STAGE_DIR" && sha256sum "${ARTIFACTS[@]}" > "$MANIFEST" && sha256sum -c "$MANIFEST" >/dev/null)

# 5) If configured, off-site failure is fatal. Publish the checksum manifest
# last so partial remote sets are not mistaken for complete recovery points.
if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  for name in "${ARTIFACTS[@]}" "$MANIFEST"; do
    "$RCLONE_BIN" copy "$STAGE_DIR/$name" "$BACKUP_RCLONE_REMOTE"
  done
fi
for name in "${ARTIFACTS[@]}" "$MANIFEST"; do
  mv "$STAGE_DIR/$name" "$BACKUP_DIR/$name"
done
rmdir "$STAGE_DIR"

# 6) Existing 14-day policy, limited to regular files in this exact directory.
# Deployment preflights preserve older backups with BACKUP_SKIP_RETENTION=1.
# Never recurse into incomplete runs or follow links during retention.
if [[ "${BACKUP_SKIP_RETENTION:-0}" != 1 ]]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -mtime +14 \
    \( -name 'onservice-*.sql.gz' -o -name 'uploads-*.tgz' -o -name 'config-*.tgz' \
       -o -name 'git-*.bundle' -o -name 'backup-*.complete' \) -delete
fi

rmdir "$BACKUP_DIR/.backup-lock"
trap - EXIT
echo "$(date -Iseconds) backup OK: verified local set $MANIFEST; offsite_configured=$([[ -n "${BACKUP_RCLONE_REMOTE:-}" ]] && echo yes || echo no); restore_test=not_run"
