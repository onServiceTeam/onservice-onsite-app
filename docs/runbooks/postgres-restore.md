# Runbook — restore from backup (Postgres + uploads)

**What gets backed up:** the nightly cron (`scripts/server/backup-db.sh`, 02:00
server time) writes two files per night to `/opt/onservice/backups/`:

- `onservice-<TS>.sql.gz` — full database dump
- `uploads-<TS>.tgz` — all uploaded files (booking photos + KYC docs)

7 days of each are kept. This is **daily** backup: worst-case data loss is the
hours since the last 02:00 run. (Continuous point-in-time recovery is a later
upgrade — see "Upgrade to PITR" below.)

> **Durability gap to close (Ken):** backups currently live on the SAME disk as
> the data. A total box/disk loss loses both. Set `BACKUP_RCLONE_REMOTE` to an
> off-box destination (a Hetzner Storage Box or any rclone remote) and install
> `rclone` so each night's files are also copied off-site. That's the final
> durability step and needs a destination + credentials from you.

---

## Restore the database

1. Pick the dump to restore (latest unless doing point-in-time recovery to an
   earlier night):
   ```bash
   ls -lt /opt/onservice/backups/onservice-*.sql.gz | head
   ```
2. **Stop the API** so nothing writes during the restore:
   ```bash
   cd /opt/onservice
   docker compose -f docker-compose.prod.yml stop api
   ```
3. Drop + recreate the schema and load the dump (this REPLACES current data):
   ```bash
   F=/opt/onservice/backups/onservice-<TS>.sql.gz
   gunzip -c "$F" | docker compose -f docker-compose.prod.yml exec -T postgres \
     psql -U onservice_user -d onservice
   ```
   If the dump fails to apply cleanly onto the live DB, recreate it first:
   ```bash
   # NOTE: separate -c flags — DROP/CREATE DATABASE cannot run inside one
   # transaction block (a single multi-statement -c would error).
   docker compose -f docker-compose.prod.yml exec -T postgres \
     psql -U onservice_user -d postgres \
     -c "DROP DATABASE onservice WITH (FORCE);" \
     -c "CREATE DATABASE onservice OWNER onservice_user;"
   gunzip -c "$F" | docker compose -f docker-compose.prod.yml exec -T postgres \
     psql -U onservice_user -d onservice
   ```
4. **Start the API** and check health:
   ```bash
   docker compose -f docker-compose.prod.yml start api
   sleep 6 && curl -s -o /dev/null -w "%{http_code}\n" https://api.onservice.ph/health
   ```

## Restore the uploaded files

```bash
F=/opt/onservice/backups/uploads-<TS>.tgz
# Wipe + repopulate the uploads volume from the tarball.
docker run --rm -v onservice_uploads_data:/data -v /opt/onservice/backups:/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/uploads-<TS>.tgz -C /data'
```
(The API and nginx read this volume live; no restart needed, but a
`docker compose ... restart nginx` doesn't hurt if files don't appear.)

## Verify a backup WITHOUT a full restore (do this monthly)

```bash
# DB dump loads into a scratch database (verified working 2026-06-04):
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U onservice_user -d postgres -c "DROP DATABASE IF EXISTS restore_test;" -c "CREATE DATABASE restore_test;"
gunzip -c /opt/onservice/backups/onservice-<TS>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U onservice_user -d restore_test -q
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U onservice_user -d restore_test -tA -c "SELECT count(*) FROM users;"
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U onservice_user -d postgres -c "DROP DATABASE restore_test;"
```
A non-zero `users` count means the dump is good.

---

## Upgrade to PITR (point-in-time recovery) — optional, post-launch

Daily dumps cap data loss at ~24h. For tighter recovery, move to continuous WAL
archiving with `pgbackrest` or `wal-g` shipping WAL to an off-box target every
few minutes. That requires the off-site destination above to exist first. Until
then, the nightly dump + off-site copy is the launch baseline.
