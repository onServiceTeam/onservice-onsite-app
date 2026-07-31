# 03 — Migrating onservice.ph (the live production app)

**This is the highest-risk step in the whole project.** This app has real
customers, real bookings, and real money held in escrow through PayMongo. Read
`CLAUDE.md` and `.ai-coder/escalations/E08-accidental-rm-on-live-server-2026-06-10.md`
before you touch anything. Guard every delete. Never run `rm -rf $VAR/...`
without `${VAR:?}`.

Old box: `5.78.143.185`, app at `/opt/onservice`, root SSH with the
`onservice_hetzner` key. Keeper: `46.62.207.225`, normal user + sudo.

## What actually has to move

The code is in GitHub, so the code is not the problem. These are the things
that exist ONLY on that old server:

**Docker volumes (the real data):**
- `onservice_pgdata_prod` — the entire Postgres/PostGIS database. Everything.
- `onservice_uploads_data` — every uploaded photo and document, including KYC
  files. S3 is disabled in production, so this volume is the only copy.
- `onservice_redisdata_prod` — sessions, cache, and BullMQ job queue state.
  Losing it logs everyone out and drops queued jobs; small, so just bring it.
- `onservice_prometheus_data`, `onservice_grafana_data`, `onservice_nginx_logs` —
  metrics and logs. Nice to have, not critical.

**Files under `/opt/onservice` that are NOT in git:**
- `.env` — every secret. The API refuses to boot in production without valid
  `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `CAPTCHA_SECRET_KEY`,
  `PAYMONGO_WEBHOOK_SECRET`, `DB_PASSWORD`, `REDIS_PASSWORD`.
- `nginx/.htpasswd`
- `certbot/conf/` — the SSL certificates (or re-issue on the keeper after DNS)
- `apps/admin/dist/` and `apps/mobile/dist-web/` — the built web bundles.
  These are gitignored and built on Ken's machine, so `git pull` will NOT
  recreate them. They must be copied or rebuilt.
- `backups/`

**Not a file, easy to forget:** root's crontab — the nightly 02:00 backup
(installed by `scripts/server/04-ops.sh`). Re-install it on the keeper.

## Step 1 — Rehearsal copy (no downtime, do this first)

Everything here runs while the site stays live. Nothing is switched over.

On the keeper, create the home and get the code:
```bash
sudo mkdir -p /opt/onservice && sudo chown $USER:$USER /opt/onservice
git clone git@github.com:onServiceTeam/onservice-onsite-app.git /opt/onservice
cd /opt/onservice && git checkout master
```
(If the keeper has no GitHub key, copy `/root/.ssh/github_deploy` from the old
box or add a new read-only deploy key in GitHub → Settings → Deploy keys. Ken
does the GitHub UI part.)

Copy the non-git files from old → keeper. Run from a machine that can reach
both, or push from the old box:
```bash
# from the OLD box
scp /opt/onservice/.env               keeper:/opt/onservice/.env
scp /opt/onservice/nginx/.htpasswd    keeper:/opt/onservice/nginx/.htpasswd
rsync -az /opt/onservice/apps/admin/dist/      keeper:/opt/onservice/apps/admin/dist/
rsync -az /opt/onservice/apps/mobile/dist-web/ keeper:/opt/onservice/apps/mobile/dist-web/
chmod 600 /opt/onservice/.env   # on the keeper afterwards
```

Copy the data volumes (this is the long one; uploads may be large):
```bash
# on the OLD box, for each volume
docker run --rm -v onservice_uploads_data:/v -v /tmp:/out alpine \
  tar czf /out/uploads.tgz -C /v .
scp /tmp/uploads.tgz keeper:/tmp/

# on the KEEPER, restore into a fresh volume
docker volume create onservice_uploads_data
docker run --rm -v onservice_uploads_data:/v -v /tmp:/in alpine \
  tar xzf /in/uploads.tgz -C /v
```
Repeat for `onservice_redisdata_prod`. For the database, prefer a proper dump
over a volume copy (a dump is consistent and version-safe):
```bash
# OLD box
cd /opt/onservice
DBC=$(docker compose -f docker-compose.prod.yml ps -q postgres)
docker exec "$DBC" pg_dump -U onservice_user -d onservice -Fc -f /tmp/onservice.dump
docker cp "$DBC":/tmp/onservice.dump /tmp/onservice.dump
scp /tmp/onservice.dump keeper:/tmp/
```
On the keeper, bring up only Postgres, then restore:
```bash
cd /opt/onservice
docker compose -f docker-compose.prod.yml up -d postgres
DBC=$(docker compose -f docker-compose.prod.yml ps -q postgres)
docker cp /tmp/onservice.dump "$DBC":/tmp/
docker exec "$DBC" pg_restore -U onservice_user -d onservice --clean --if-exists /tmp/onservice.dump
docker exec "$DBC" psql -U onservice_user -d onservice -tAc "select count(*) from pgmigrations;"
```
That count must match the old box (it was 134 rows through migration 145 as of
the last handoff). Also compare row counts on a few real tables, `users`,
`bookings`, `wallets`, old vs new. Write the numbers down.

Change the nginx port binding so it does not fight the front door
(see `02-keeper-layout.md`):
```yaml
  nginx:
    ports:
      - "127.0.0.1:8081:80"
```
Then start everything and check health:
```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps          # all Up/healthy
docker compose -f docker-compose.prod.yml logs --tail=100 api
```

## Step 2 — Test the keeper copy BEFORE any DNS change

Add the front-door nginx vhosts for the onservice hostnames, get certificates
(certbot can issue using the `--webroot` challenge only after DNS points here,
so for the rehearsal use a self-signed cert or test over plain HTTP on
localhost), then test with a hosts-file override on Ken's PC.

On Windows, edit `C:\Windows\System32\drivers\etc\hosts` as administrator and
add:
```
46.62.207.225 app.onservice.ph
46.62.207.225 admin.onservice.ph
46.62.207.225 api.onservice.ph
```
Now Ken's browser goes to the KEEPER while the rest of the world still goes to
the old server. Log in, open a booking, view a photo, load the admin app. When
everything works, **remove those hosts lines again.**

## Step 3 — The real cutover (short downtime, do it in a quiet hour, PH time)

Lower DNS TTL to 300 seconds at GoDaddy at least a day before (see
`05-dns-godaddy-cutover.md`).

1. Put the old site into maintenance, or simply accept a few minutes of
   inconsistency, and **stop the API on the old box** so no new writes land:
   `docker compose -f docker-compose.prod.yml stop api`
2. Take a final database dump and a final uploads sync (same commands as
   step 1 — the delta will be small).
3. Restore the final dump on the keeper, re-sync uploads.
4. Start the full stack on the keeper, confirm healthy.
5. Flip the GoDaddy A-records to 46.62.207.225.
6. Issue real certificates on the keeper once DNS has propagated.
7. Verify (below).
8. Leave the old box running but with its API stopped, for at least two weeks.

## Step 4 — Verify (do all of it, write down the results)

- `https://app.onservice.ph` loads; log in with a real account.
- `https://admin.onservice.ph` loads and shows real data.
- A booking photo displays (proves the uploads volume came across).
- `https://app.onservice.ph/api/v1/...` responds 200 through the same-origin path.
- Background jobs are alive: `docker compose logs api | grep -i schedul`.
  The workers re-register themselves at boot, so they self-heal.
- Payments: make one small real payment end to end. PayMongo delivers webhooks
  by hostname (`https://api.onservice.ph/api/v1/webhooks/paymongo`), so no
  PayMongo dashboard change is needed if the hostname is unchanged; confirm
  the webhook arrives in the API logs.
- SMS login still works (Semaphore is outbound only, no change needed).
- SSL: all hostnames show a valid certificate and `certbot renew --dry-run` passes.

## Step 5 — Things that point at the old server and must be updated

- **GitHub Actions secret `DEPLOY_HOST`** (also `DEPLOY_USER`, `DEPLOY_SSH_KEY`)
  — repo Settings → Secrets and variables → Actions. Until this changes,
  deploys keep going to the dead server. Ken does this in the GitHub UI.
- The nginx api vhost carries a pre-launch gate `allow 124.105.80.4; deny all;`
  and the box runs staging flags (`ALLOW_DEV_OTP`, `ADMIN_DISABLE_2FA` — see
  escalation E07). **Carry them over unchanged.** Flipping them to real
  production settings is launch-cutover work, not migration work. Changing two
  things at once is how you lose a weekend.
- Any Hetzner Cloud Firewall rules attached to the old server need equivalents
  on the keeper.
- Re-install root's nightly backup crontab (`scripts/server/04-ops.sh`).
