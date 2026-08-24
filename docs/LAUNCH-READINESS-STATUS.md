# Launch Readiness — status snapshot (updated 2026-08-24)

Single source for "what's done / what's left to go live." For the operational
detail of each external item, see `docs/runbooks/launch-cutover.md`.

Historical test counts below are not a current release certificate. Current
authority is `AGENTS.md`, the active escalation/decision files,
`LAUNCH-LIMITATIONS.md`, and the latest CI/deployment evidence.

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
- **TLS configuration** — TLS 1.2/1.3, HSTS preload, current Let's Encrypt CRL
  revocation metadata, and session resumption are configured. Let's Encrypt
  ended OCSP support in 2025, so obsolete stapling directives were removed.
  The installed certificate is valid for `app`, `admin`, `api`, and `www`, but
  not for the bare `onservice.ph` hostname. The apex certificate gap is open
  under E17 and launch limitation 40.
- **Sentry** — wiring fixed to accept the env name the runbook documents, so
  error tracking turns on the moment you add a DSN.
- **Security posture** — firewall is 22/80/443 only; Postgres/redis/monitoring
  are not publicly exposed (verified on the server). On 2026-08-24 the public
  API's developer OTP, relaxed rate limits, and admin-2FA bypass were disabled;
  a privileged account using a published demo credential was deactivated and
  its 13 sessions revoked. The remaining privileged account has TOTP.

---

## LEFT — only you or an external party can do these (I physically can't)

| # | Item | Owner | Blocker? | Note |
|---|------|-------|----------|------|
| 1 | NPC DPO registration | You | YES | Government, ~21 days. Start ASAP. |
| 2 | BIR Authority to Print (OR series) | You / accountant | YES | Government, ~14–21 days. |
| 3 | DTI permit current | You | YES | Verify active. |
| 4 | Mayor's / business permit (Cebu) | You | YES | Verify current. |
| 5 | Cloudflare Turnstile production keys/evidence | You / me | YES | Provider decision and client/server wiring are complete. The live host has no real secret or Cloudflare API token, so it cannot yet switch to `NODE_ENV=production`. Add separate production keys, run `verify-turnstile.sh`, and exercise the threshold-triggered OTP challenge on deployed web/native. |
| 6 | Sentry production DSN | You | YES | Code ready; just create the project + paste the DSN. |
| 7 | PayMongo onboarding plus a valid external authorization flow | You / me | YES | Live-looking keys are present, but that is not launch evidence. E14 blocks the current invalid hosted URL; approve and test Checkout Sessions or the client Payment Method flow before live use. |
| 8 | BIR receipt long-term retention | You / me | gated on #2 | Was specced as S3 Object Lock; on Hetzner we'll do WORM-style local + off-site. Not needed until BIR pipeline is live. |
| 9 | Backups and PITR/RPO sign-off | You / me | YES | Nightly logical DB+upload backups and Hetzner snapshots exist and a restore was tested. Continuous PITR is not proven; launch needs an explicit recovery objective and restore evidence under Item 9. |
| 10 | DNS + TLS | me / certificate authority | YES | `app`, `admin`, `api`, and `www` are valid. The bare `onservice.ph` resolves to production but is missing from the installed certificate SANs. Reissue/expand and verify under E17. |
| 11 | Admin SSO | optional | no | Deferrable per the runbook. |
| 12 | BIR e-receipt verification | You / me | gated on #2 | Verifiable once the ATP serial range exists. |
| — | **Legal docs (F#10/E10 + Terms/Privacy/IC)** | You / attorney | YES | The June draft is historical, not attorney approval. Final disclaimer/guarantee wording, entity identity, DPO details, and Philippine counsel review remain launch requirements. |
| — | F#3 / F#4 visual baselines | CI/me | F#3 YES | F#4's 354 admin baselines are done. F#3 still needs the committed 84 Maestro flows captured on a supported simulator/emulator. |
| — | In-app chat send reliability (§25) | me (v1.1) | no | Mobile real-time client issue; needs device testing. Spec-deferred to v1.1; "Call provider" + photo/dispute flows work. |

### The short version
The app still has launch blockers. In addition to the external registrations,
PayMongo E14 remediation, Sentry and Turnstile production evidence, the
F#10/E10 legal review, F#3 native baselines, and the bare-domain TLS
certificate must be corrected under E17. This status snapshot is historical in
places and must be read with `LAUNCH-LIMITATIONS.md` and the current escalation
files rather than treated as a launch certificate.
