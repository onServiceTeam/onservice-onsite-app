# 04 — Migrating medclaimspro.com and the Cochi Loco POS

Unlike onservice.ph, these two are not in this repository, so the exact steps
depend on what the discovery report finds on `5.78.143.185`. What follows is
the pattern to apply to each, plus the specific questions the report answers.

## First, identify what you are actually moving

From the discovery report for the old box, for EACH of medclaimspro and the POS
(if a POS exists at all — Ken is not sure), write down:

1. **Where the code lives** — a path under `/opt`, `/srv`, `/var/www`, or a
   home directory. Is it a git repository (`git remote -v`)? Are there
   uncommitted changes? If the code exists only on that server and nowhere
   else, **that is the single most fragile thing in this migration** — get it
   into GitHub before anything else.
2. **How it runs** — docker compose, a systemd service, PM2, or plain nginx
   static files. The report lists running services, containers, and enabled
   units.
3. **Its database** — engine (Postgres/MySQL/SQLite/Mongo), database name,
   size, and where the connection details live (usually a `.env` file next to
   the code).
4. **Its uploaded files** — any directory or volume holding user content.
5. **Its web configuration** — the nginx or apache vhost, and its SSL cert.
6. **Its scheduled jobs** — cron entries mentioning its path.
7. **Its secrets** — the `.env` file (the discovery report lists variable names
   so you know what exists without exposing values).

## The pattern (same shape for each project)

1. **Back up the code to GitHub first.** If it is not in a repo, create a
   private one and push. Nothing else in this migration is safe until the code
   exists in a second place.
2. **Create its home on the keeper**: `/opt/medclaimspro/` or
   `/opt/cochi-loco-pos/`, and write its `README.md` using the template in
   `02-keeper-layout.md`.
3. **Assign it an internal port** (8082, 8083) and record it in
   `/opt/SERVER-MAP.md`. It listens on `127.0.0.1:<port>`; the front door
   handles the public side and SSL.
4. **Move the code**: clone from GitHub, or `rsync -az` the directory across.
5. **Move the database**: `pg_dump -Fc` (Postgres) or `mysqldump --single-transaction`
   (MySQL) on the old box, copy across, restore into a fresh container or
   database on the keeper. Compare row counts on the main tables, old vs new.
6. **Move uploads/user files**: `rsync -az` the directory, or tar the docker
   volume the same way as in `03-onservice-migration.md`.
7. **Move secrets**: copy the `.env` by hand, `chmod 600`. Never commit it.
8. **Recreate scheduled jobs** on the keeper.
9. **Test with a hosts-file override** on Ken's PC before touching DNS
   (see `03-onservice-migration.md` step 2).
10. **Flip DNS**, then issue the real certificate on the keeper.
11. **Verify**: site loads, login works, a record saves, a file uploads and
    displays, SSL valid, `certbot renew --dry-run` passes.

## Specific to medclaimspro.com

It is a medical-claims product, so assume its database contains sensitive
health-related personal data. Handle accordingly:
- Copy the dump over SSH only (never through a third-party file service).
- Delete dump files from `/tmp` on both boxes when the migration is done
  (`shred -u` if available).
- Confirm its database on the keeper is bound to localhost or a docker
  network, never exposed publicly.
- Note in its README that it holds sensitive data.

Also worth knowing: another AI session was actively building on medclaimspro
around 2026-07-17. Confirm with Ken that the work is finished, or at least at
a stopping point, before you migrate it. Migrating a codebase while someone
else is mid-change loses work.

## Specific to the Cochi Loco POS

It may not exist. The discovery script hunts for directories and containers
matching cochi, loco, pos, restaurant, resto, kitchen, and menu, and also lists
every directory under `/opt`, `/srv`, `/var/www`, and `/home`, so an
oddly-named project still shows up.

If it does exist, ask Ken two questions before migrating it:
1. Is it still wanted, or was it an experiment that can simply be archived?
   (If archived: tar the directory plus a database dump, copy it off-server to
   Ken's machine, and skip the migration entirely.)
2. Does it have a domain? Nothing in DNS currently points at a POS hostname,
   which suggests it was never made public. If it needs one, Ken adds the DNS
   record and it gets a certificate like everything else.
