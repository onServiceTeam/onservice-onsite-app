# 06 — Decommissioning the old server (the last step, never early)

The old box `5.78.143.185` is the only copy of several things. It gets deleted
**last**, after everything has been running on the keeper long enough to trust.
Deleting a Hetzner server is instant and permanent.

## The gate: do not proceed unless every line is true

- [ ] Every app that lived on the old box runs on the keeper and has been
      verified by a human clicking through it, not just "the container is up".
- [ ] Every domain resolves to the keeper and loads over HTTPS with a valid
      certificate.
- [ ] `certbot renew --dry-run` passes on the keeper.
- [ ] Real end-to-end checks passed: a login, a booking, a payment with the
      PayMongo webhook arriving, a photo upload that displays afterwards.
- [ ] Database row counts on the keeper match the old box for the main tables.
- [ ] Nightly backups run on the keeper and a restore has been tested at least
      once (`docs/runbooks/postgres-restore.md`).
- [ ] GitHub Actions secret `DEPLOY_HOST` points at the keeper, and one deploy
      has succeeded through it.
- [ ] No MX (email) record for any domain points at the old server.
- [ ] At least **14 days** have passed since the DNS cutover with no issues.
      Monthly jobs (invoice generation, security cleanup) run on the 1st, so a
      full month is even better if you can wait.

## Before you cancel: take the final off-server copies

Copy these to Ken's own machine or external storage, not to the keeper. The
point is a copy that survives if the keeper has a bad day.

```bash
# on the OLD box
cd /opt/onservice
DBC=$(docker compose -f docker-compose.prod.yml ps -q postgres)
docker exec "$DBC" pg_dump -U onservice_user -d onservice -Fc -f /tmp/final-onservice.dump
docker cp "$DBC":/tmp/final-onservice.dump /tmp/
docker run --rm -v onservice_uploads_data:/v -v /tmp:/out alpine tar czf /out/final-uploads.tgz -C /v .
tar czf /tmp/final-config.tgz /opt/onservice/.env /opt/onservice/nginx/.htpasswd /opt/onservice/certbot
# plus the same for medclaimspro and the POS, per their discovery findings
```
Download them, then verify locally that the archives actually open. A backup
you have not opened is not a backup.

Also take a **Hetzner snapshot** of the old server in the Hetzner console
before deleting. A snapshot costs a small monthly fee and can be restored into
a new server if something surfaces weeks later. Keep it for a month or two,
then delete it. Cheap insurance.

## Then decommission

1. Hetzner console → the old server → Power off. **Leave it powered off for a
   few days.** If something breaks, you can power it back on. This is the step
   people skip and regret.
2. After a few quiet days: Hetzner console → Delete server.
3. Cancel any attached volumes, floating IPs, or firewalls tied only to it.
4. Check the Hetzner invoice the following month to confirm the charge stopped.

## Security cleanup (do this regardless)

Several passwords were shared in chat during this project. Rotate all of them:

- [ ] The keeper's sudo password for the admin user.
- [ ] The SSH key passphrase, or generate a fresh key pair and replace the
      authorized key on the keeper.
- [ ] Any old-server credentials that were reused anywhere else.
- [ ] Review `authorized_keys` on the keeper and remove keys you do not
      recognize or no longer need.
- [ ] Confirm on the keeper: root SSH login disabled, password authentication
      disabled, fail2ban running, firewall allows only 22/80/443.
- [ ] Consider restricting SSH to Ken's IP with a Hetzner Cloud Firewall.

Store the new secrets in a password manager, not in chat and not in the repo.

## After decommission: one server, clearly documented

Final state to confirm:
- `/opt/SERVER-MAP.md` on the keeper lists every project, its domains, its
  port, its database, its data locations, and its backup story.
- Every project directory has its own `README.md`.
- Nightly backups cover **every** project's database and files, not just
  onservice, and they land somewhere off the server.
- Monitoring or at least uptime checks on the public domains, so you learn
  about an outage before a customer tells you.

One server carrying every product is cheaper, and it is also a single point of
failure. Off-server backups are what make that trade safe.
