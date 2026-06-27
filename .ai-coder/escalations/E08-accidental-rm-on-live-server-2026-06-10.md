# E08 — Accidental `rm -rf /*` on the live staging server

**Date:** 2026-06-10
**Raised by:** AI coder (I caused this)
**Severity:** CRITICAL — staging host OS filesystem destroyed; SSH login down.
**Status:** RESOLVED — 2026-06-10. Ken rebuilt the box from a ~June-5 backup
(commit 36e9040, DB data intact: 124 bookings, 5+5 seeded accounts). I brought
it fully current: `git pull` to origin/master 8ec2521, rebuilt the API image,
confirmed migrations already at 123/123 (no pending/destructive schema changes),
re-set UPLOAD_BASE_URL, recreated the nginx Basic-Auth `.htpasswd` (tester) and
the QA admin DB user, shipped fresh admin dist + same-origin mobile dist-web,
force-recreated nginx. Verified end-to-end: app gate 401→200, customer OTP login
(000000) returns tokens, admin login works, /privacy public, all containers
healthy. No data lost. Guardrails added: [[feedback_no_unvalidated_rm]].

> Keep this file LOCAL. Operational incident detail.

## What happened (plainly)

While deploying the new web bundle, I ran a one-line remote command that used
`docker inspect ... --format '{{...}}'` to discover the nginx app-mount path and
then `rm -rf $APPDIR/*`. The `--format` template's quotes got mangled passing
through PowerShell → ssh, so `docker inspect` failed and **`APPDIR` was empty**.
That turned `rm -rf $APPDIR/*` into **`rm -rf /*`** running as root on the host.

This is my fault. I should have written the path literally or guarded against an
empty variable (`${APPDIR:?}`), and I should not have chained a destructive `rm`
to an unvalidated command substitution on a live box.

## Current state (observed remotely)

- **SSH login is broken.** `ssh root@5.78.143.185` authenticates then immediately
  "Connection closed" — consistent with `/etc` (passwd/PAM/ssh config) being
  deleted. Port 22 is still open (sshd listening) but sessions can't start.
- **Running containers survived in memory** (host FS damage doesn't kill already-
  running containers): nginx still answers (returns 403/500), the API process
  still answers Express.
- **The database is NOT reachable from the API now.** DB-backed endpoints that
  returned 200 earlier today now return 500 — postgres/pgbouncer likely stopped
  or its data path was hit. (`rm -rf /*` processes args alphabetically:
  bin→…→etc→home→…→opt→proc→…; `/etc`, `/home`, `/opt/onservice` were deleted
  before it hit the virtual `/proc` where it spent the rest of its time erroring.
  Whether it reached `/var/lib/docker` before ssh closed and SIGHUP'd it is
  unknown — the 500s suggest DB storage may have been affected.)

## What is NOT lost

- **All code is safe on GitHub.** Every fix from this session is pushed to
  `master` (HEAD `8ec2521`). Nothing in the repo depends on the server.
- **No real/production data existed on this box.** It held only **seed/test
  data**: 6 seeded customers, 5 seeded providers, 1 super-admin, plus 2 accounts
  I created today (a QA admin + a Basic-Auth gate user). Every bit of it is
  reproducible from `packages/api/migrations` + `packages/api/seeds` and the
  bootstrap script. There is no irreplaceable data here.
- Hetzner staging had **no automated backups** configured yet (that was a
  production-cutover item), but because the data is all reproducible, that does
  not matter for recovery.

## Recovery — needs Ken (Hetzner console)

I cannot fix this over SSH (it's down). Two paths; **I recommend Option A.**

### Option A — clean rebuild (recommended)
1. Ken: log into https://console.hetzner.cloud → the `onservice` project.
2. Select the server (5.78.143.185) → **Rebuild** with **Ubuntu 24.04** (this
   wipes the disk), keeping the existing SSH key. (Or delete + create a fresh
   CPX31, US-West, same SSH key — the IP may change; if so, tell me the new IP.)
3. Confirm `ssh root@<IP>` works again, then tell me.
4. I redeploy everything from scratch per `docs/HETZNER-DEPLOY.md`: install
   Docker, clone the repo, generate `.env` (DB password + JWT), bring up
   `docker-compose.prod.yml`, run migrations, seed, provision TLS, rebuild +
   ship the admin + web bundles, re-create the QA/test accounts, re-apply the
   E07 Basic-Auth gate. Est. 1–2 hours of my time once SSH is back.
5. Ken re-pastes the third-party secrets on the box (PayMongo, SMS, S3) — same
   as the original stand-up; nothing sensitive in chat.

### Option B — rescue-repair the existing box
Boot Hetzner **Rescue** system, mount the disk, check `/var/lib/docker` for the
DB volume, reinstall deleted packages, reconstruct `/etc`. Messier and uncertain;
only worth it to salvage irreplaceable data — and there is none. Not recommended.

## Guardrails I'm putting on myself after this
- Never chain `rm -rf` to an unvalidated command substitution. Use
  `${VAR:?must be set}` so an empty value aborts instead of expanding to `/`.
- Prefer literal paths for destructive ops on the server; no `docker inspect`
  templating through the PowerShell→ssh quoting boundary.
- Run destructive remote steps as a reviewed, idempotent script file, not an
  inline one-liner.
