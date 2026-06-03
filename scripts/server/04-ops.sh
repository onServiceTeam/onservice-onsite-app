#!/usr/bin/env bash
# scripts/server/04-ops.sh — DNS-independent ops: backups + monitoring.
# Idempotent. Run on the server from /opt/onservice as root.
set -euo pipefail
cd /opt/onservice

echo "==> [1/3] Install nightly DB backup cron (2AM server time)"
chmod +x scripts/server/backup-db.sh
( crontab -l 2>/dev/null | grep -v 'backup-db.sh' ; \
  echo "0 2 * * * /opt/onservice/scripts/server/backup-db.sh >> /opt/onservice/backups/backup.log 2>&1" ) | crontab -
crontab -l | grep backup-db.sh

echo "==> [2/3] Take an initial backup now"
bash scripts/server/backup-db.sh

echo "==> [3/3] Bring up monitoring (Prometheus + Grafana, localhost only)"
docker compose -f docker-compose.prod.yml up -d prometheus grafana 2>&1 | tail -4
echo "OPS_DONE"
