# E07 — Live server auth-bypass configuration (staging flags on a public box)

**Date:** 2026-06-09
**Raised by:** AI coder (security audit of live box, requested by Ken)
**Severity:** High (auth bypass reachable from the public internet)
**Status:** MITIGATED via Option A (verified deployed 2026-06-10). The public
exposure is closed while dev OTP stays on for testing:
- admin.onservice.ph gated behind HTTP Basic Auth (eac0e7d; nginx/.htpasswd on box)
- app.onservice.ph + api.onservice.ph restricted to operator IP at nginx (e0752ee)
- infra/docker/.env.docker untracked from the public repo (12a8483)
Server verified on commit e0752ee with nginx restarted and .htpasswd present.
REMAINING for production cutover (Option B steps): real OTP/SMS delivery,
remove ALLOW_DEV_OTP/DEV_OTP_CODE, ADMIN_DISABLE_2FA=0 + enroll 2FA,
NODE_ENV=production, and remove the nginx allowlist/Basic-Auth gates.
Tracked in docs/runbooks/launch-cutover.md.

> NOTE: keep this file LOCAL. Do NOT commit/push it — the repo is public and
> this document describes an exploitable configuration on the live box.

## What was found

Audit of the live box `5.78.143.185` (app/api/admin.onservice.ph). The server
itself is well-hardened (see "Good posture" below). The problem is the running
**application config**, not the OS.

Production `.env` (`/opt/onservice/.env`, used by `docker-compose.prod.yml`):

| Key | Value on live box | Risk |
|---|---|---|
| `NODE_ENV` | `staging` | A1 production guard (`assertAdmin2faNotDisabledInProduction`) only fires when NODE_ENV=production, so it is bypassed. |
| `ALLOW_DEV_OTP` | `1` | Any OTP login accepts the fixed dev code. |
| `DEV_OTP_CODE` | `000000` | Universal OTP — anyone can log in as any user by entering 000000. |
| `ADMIN_DISABLE_2FA` | `1` | Admin two-factor disabled. |
| `ENABLE_TEST_FIXTURES` | absent | OK (not enabled in prod). |

Combined effect: a public visitor who knows/guesses an account identifier can
request an OTP and authenticate with `000000`; admin accounts have no 2FA. This
is reachable now over HTTPS on the real domains.

No evidence of server compromise: SSH is key-only (`passwordauthentication no`,
`permitrootlogin without-password`), ufw default-deny, fail2ban active. The
brute-force SSH noise in auth.log cannot succeed.

## Secret hygiene (separate, lower severity)

`infra/docker/.env.docker` is **tracked in the public GitHub repo** (committed at
718f1a8) and is world-readable (644) on disk. It contains **dev-only** values
(local Postgres password, MinIO keys, a dev JWT secret, dev OTP). Verified the
production `.env` does NOT reuse any of these (JWT_SECRET and DB_PASSWORD hashes
differ; S3/Grafana/MMKV keys not present in prod `.env`). So this is bad hygiene
and burns the dev credentials, but it is not the prod-secret leak it first looked
like. Prod `.env` is correctly 600 + gitignored + untracked.

## Why the AI coder did NOT auto-fix

This is a CLAUDE.md hard stop (money/compliance + production-data risk + an
operational decision that is Ken's):
1. Turning off `ALLOW_DEV_OTP` with no real SMS/OTP delivery configured would
   lock everyone (incl. Ken) out of login on the test box.
2. Setting `NODE_ENV=production` while `ADMIN_DISABLE_2FA=1` makes the API refuse
   to boot (A1 guard throws) — taking the API down.
3. Whether this box is "intentional pre-launch staging" vs "must be locked down
   as production now" is Ken's call and depends on whether real user data is on it.

## Options for Ken

**Option A — Keep it as a private staging box (recommended if still testing).**
Leave dev OTP on so Ken can test, but stop the public from reaching it: add an
nginx IP-allowlist or HTTP Basic Auth gate in front of admin (and optionally the
whole site). Closes the exposure without breaking dev-OTP login. Low risk; I can
do this without touching the auth flags. Caveat: gating `api.onservice.ph` would
also gate the mobile web app's API calls, so we'd scope the gate (e.g. admin-only,
or allowlist Ken's IP for the whole site).

**Option B — Lock it down as production now.** Requires, in order, as a single
cutover (this is the launch-cutover work in `docs/runbooks/launch-cutover.md`):
  1. Wire a real OTP/SMS provider and verify delivery.
  2. Remove `ALLOW_DEV_OTP` + `DEV_OTP_CODE`.
  3. Set `ADMIN_DISABLE_2FA=0` and enroll admin 2FA.
  4. Set `NODE_ENV=production` (A1 guard now passes).
  5. Restart API; verify login + admin 2FA end-to-end.
This will require Ken to re-login with real 2FA and will stop the 000000 shortcut.

**Either way — secret hygiene (safe, do soon):**
  - `git rm --cached infra/docker/.env.docker`, add to `.gitignore`, commit an
    `infra/docker/.env.docker.example` with placeholders.
  - `chmod 600 infra/docker/.env.docker` on disk.
  - Treat the dev creds in git history as burned (rotate local dev MinIO/JWT when
    convenient; low impact since dev-only).

## Good posture already in place (for the record)
- Ubuntu 24.04 LTS, 0 pending security updates, unattended-upgrades on.
- ufw active: default deny in; only 22/80/443 open.
- SSH: key-only, no password auth, no empty passwords, maxauthtries 3, x11 off.
- fail2ban: sshd + nginx-limit-req + recidive jails active.
- Postgres + Grafana bound to 127.0.0.1; pgbouncer/redis/api/prometheus are
  docker-internal only (not published to host). Only 80/443 are public.
- TLS via certbot.
