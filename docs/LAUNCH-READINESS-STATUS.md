# Launch Readiness — status snapshot (2026-06-05)

Single source for "what's done / what's left to go live." For the operational
detail of each external item, see `docs/runbooks/launch-cutover.md`.

At this snapshot: master = server = green; API 2888 tests, admin 153, mobile 654
all passing; all 5 CI gates green; api/admin/app all serving HTTPS 200.

---

## DONE — everything I can complete from code + the server

These are shipped to production and verified:

- **Webhook idempotency** (§33) — PayMongo can't double-process an event.
- **OTP login race** (§34.2) — concurrent code submits can't create double
  sessions / duplicate users.
- **KYC document privacy** (§35a) — gov ID / NBI / selfie served only through an
  authenticated proxy (owner/admin), private-by-default uploads, presigned-URL
  option; no public bearer URLs.
- **Refund / dispute money atomicity** (§35b) — `processRefund` is FOR-UPDATE
  locked; failed dispute refunds/releases are queued for retry instead of being
  silently dropped.
- **Upload hardening** (§35c) — real content-sniffing (no disguised files) +
  per-user upload rate limit.
- **Staff-driven job completion** (D15) — approved team members can document +
  complete their own jobs; quality rolls up to the provider.
- **File storage** (§36) — was misconfigured to a DigitalOcean Space (you have
  no DO account), so uploads were broken. Now on the Hetzner box's own disk with
  a persistent volume; booking photos public, KYC private.
- **Backups** — the nightly backup cron had been **failing every night**
  (non-executable script); fixed. Now backs up the DB **and** uploaded files
  nightly, keeps 7 days, and a dump has been restore-tested. Runbook:
  `docs/runbooks/postgres-restore.md`.
- **TLS** — TLS 1.2/1.3, HSTS preload, OCSP stapling, session resumption (A+
  target). Verified TLS 1.3 + valid cert in production.
- **Sentry** — wiring fixed to accept the env name the runbook documents, so
  error tracking turns on the moment you add a DSN.
- **Security posture** — firewall is 22/80/443 only; Postgres/redis/monitoring
  are not publicly exposed (verified on the server).

---

## LEFT — only you or an external party can do these (I physically can't)

| # | Item | Owner | Blocker? | Note |
|---|------|-------|----------|------|
| 1 | NPC DPO registration | You | YES | Government, ~21 days. Start ASAP. |
| 2 | BIR Authority to Print (OR series) | You / accountant | YES | Government, ~14–21 days. |
| 3 | DTI permit current | You | YES | Verify active. |
| 4 | Mayor's / business permit (Cebu) | You | YES | Verify current. |
| 5 | **CAPTCHA provider decision** | You | medium | See escalation **E07**: code uses Cloudflare Turnstile, runbook says hCaptcha, client widget not wired. Pick a provider and I finish wiring + verify. Baseline today = rate-limit + OTP. |
| 6 | Sentry production DSN | You | YES | Code ready; just create the project + paste the DSN. |
| 7 | PayMongo live mode | You | YES | KYC onboarding + live keys (you paste secrets). ~14–30 days. |
| 8 | BIR receipt long-term retention | You / me | gated on #2 | Was specced as S3 Object Lock; on Hetzner we'll do WORM-style local + off-site. Not needed until BIR pipeline is live. |
| 9 | Backups OFF-SITE + (optional) PITR | You + me | recommended | Nightly backups work but sit on the same disk as the data. Give me an off-box target (Hetzner Storage Box / rclone remote) and I wire the off-site copy. |
| 10 | DNS + TLS | done | — | Live on HTTPS; A+ config shipped. |
| 11 | Admin SSO | optional | no | Deferrable per the runbook. |
| 12 | BIR e-receipt verification | You / me | gated on #2 | Verifiable once the ATP serial range exists. |
| — | **F#10 legal disclaimer** | Attorney | YES | Final wording needs an attorney; interim wording is live with a CI guard. I cannot write legal language. |
| — | F#3 / F#4 visual baselines | CI/me | no | Need a Linux CI run / mobile simulator to capture correctly (capturing on Windows would produce wrong baselines). Functional tests already pass. |
| — | In-app chat send reliability (§25) | me (v1.1) | no | Mobile real-time client issue; needs device testing. Spec-deferred to v1.1; "Call provider" + photo/dispute flows work. |

### The short version
The **app and its infrastructure are launch-ready from a code, data-durability,
and security standpoint.** What stands between here and "open to all users" is
almost entirely **external/administrative**: the government registrations
(NPC/BIR/DTI/Mayor), going live on PayMongo, creating a Sentry project, and one
CAPTCHA provider decision (E07). The moment you hand me (a) the CAPTCHA provider
choice and (b) an off-site backup target, I'll close those two out and verify
them. The rest are forms, KYC, and sign-offs that only you can submit.
