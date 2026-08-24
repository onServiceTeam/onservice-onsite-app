# Launch Cutover Runbook (Phase 14 Dispatch 14)

**Status (2026-08-24):** the verification harness and runbook exist, but the
launch is not approved. F#3, F#10/E10, E14, E16, E17, and the unsigned
operational items below remain open. The `v1.0.0-launch-ready` tag is applied to
master only after every required sign-off and repository gate is genuinely
green.

**Tag at completion of AI work:** `v0.14.0-d14-complete`
**Tag at launch approval:** `v1.0.0-launch-ready` (applied by Ken after all sign-offs)

---

## How to use this runbook

Each item is independently scheduled (parallel where possible). For each item:

1. Read the item header (Owner / time / dependencies / cost).
2. Follow the steps.
3. Run the listed `bash scripts/verify-<item>.sh` — it returns 0 on PASS, non-zero on FAIL.
4. Sign off the item.

If an item fails verification:

1. Read the FAIL output.
2. Resolve the underlying issue (the verify script's output names the missing piece).
3. Re-run.
4. Do NOT skip or stub past a FAIL — every item is a launch blocker.

---

## Item 1 — NPC DPO registration

**Owner:** Ken (or designated officer)
**Estimated time:** 14–30 business days (NPC review takes ~21 days)
**Dependencies:** none — start immediately, parallel to all other items
**Cost:** Free (own DPO) or ₱15k–40k/month (fractional DPO services)

### Steps

1. Decide: Ken serves as DPO, or hire fractional service (Privacy Innovate, Privacy Counsel PH, etc.).
2. If Ken serves: complete free NPC online training at https://privacy.gov.ph/npc-academy/.
3. Compile required information:
   - PIC (Personal Information Controller) details: company name, TIN, business address, registered owner.
   - DPO details: full name, role title, email (`dpo@onservice.ph` recommended), phone.
   - Description of personal data processed (categories: customer phone/email/address/payment; provider NBI/government ID/financial).
   - Privacy policy URL (must be publicly accessible). **Now live:**
     `https://app.onservice.ph/privacy` (and `/terms`) — static, crawlable pages.
4. Submit registration at https://privacy.gov.ph/dpo-registration/.
5. Await confirmation email (typically 14–21 days).
6. Update `LAUNCH-LIMITATIONS.md` §26 with NPC PIC registration number (`NPC-PIC-NNNNNN`).
7. Update privacy-policy markdown content with DPO contact email.

### Verification

```bash
bash scripts/verify-dpo-registered.sh
```

### Rollback

Cannot launch without DPO registration. If NPC review delays past target launch date, postpone launch.

### Sign-off

- [ ] Ken — date / NPC reg #
- [ ] DPO themselves — date

---

## Item 2 — BIR principal-invoice authority and serial allocation

**Owner:** Ken (or accountant)
**Estimated time:** 14–21 business days
**Dependencies:** DTI / Mayor's permit current; BIR registration up to date
**Cost:** ~₱500 ATP fee + accountant time

### Steps

1. Give the actual entity registration, taxpayer profile, marketplace money
   flow, and sample customer/provider documents to the Philippine accountant.
2. Resolve escalation E22 in writing: principal document type, seller and tax
   basis, ATP/CAS/e-invoicing path, required fields, cancellation mechanism,
   serial format/range/reset rules, retention, and recurring filing calendar.
3. File the current BIR application/permit required for the approved path. BIR
   Form 1906 is currently titled Application for Authority to Print Invoices;
   do not request an Official Receipt as the principal document based on this
   software's legacy naming.
4. Save the authority/permit and accountant sign-off in the encrypted
   compliance evidence store.
5. Implement the approved document model and bounded serial allocation. The
   removed `BIR_OR_SERIES_*` variables were dead configuration and must not be
   restored as launch evidence.
6. Verify the real invoice pipeline against the actual API, database table,
   generated document, delivery path, and retained artifact (Item 12).

### Verification

```bash
bash scripts/verify-bir-or-series.sh
```

This command intentionally fails while E22 is open. A non-zero result is the
correct behavior until the approved document model and real verifier land.

### Sign-off

- [ ] Ken — date / ATP # / serial range

---

## Item 3 — DTI permit verification

**Owner:** Ken
**Estimated time:** 1 day verification (current); 14 days renewal (expired)
**Cost:** Free verification; ₱200–500 renewal

### Steps

1. Login to https://bnrs.dti.gov.ph/ with BNRS credentials.
2. Verify Business Name Registration is "Active" with expiry > 90 days from launch.
3. If expiring soon, file renewal.
4. Save current certificate PDF to encrypted backup.

### Verification

Manual confirmation. Save PDF to encrypted backup.

### Sign-off

- [ ] Ken — date / certificate expiry

---

## Item 4 — Mayor's / business permit (launch city LGU)

The platform is multi-city; this item is for the **launch market's** local
government unit. Default launch market is **Metro Cebu** (Cebu City LGU). If a
different city is launched first, substitute that city's LGU (e.g. Malay
Municipal Hall for Boracay, General Santos City Hall for GenSan).

**Owner:** Ken
**Estimated time:** 1 day verification; 30+ days renewal if expired
**Cost:** Free verification; ₱5k–20k renewal depending on classification

### Steps

1. Visit the launch city's Business Permits and Licensing Office (Cebu City
   Hall BPLO for the default Cebu launch).
2. Verify Mayor's / business permit is current for that city.
3. Save PDF to encrypted backup.
4. Repeat per city as new markets are turned on in admin.

### Verification

Manual confirmation.

### Sign-off

- [ ] Ken — date / permit expiry

---

## Item 5 — CAPTCHA (Cloudflare Turnstile)

**Owner:** Ken **Cost:** Free **Time:** ~15 min

The app uses **Cloudflare Turnstile** (free, no KYC). Server verification and the
mobile challenge UI are both wired (the captcha appears only after the
failed-attempt lockout, to stop bots burning SMS). You only need to create the
keys:

### Steps

1. Go to https://dash.cloudflare.com/ → **Turnstile** → **Add site**.
2. Domain: `onservice.ph` (add `app.onservice.ph` too). Widget mode: **Managed**.
3. Copy the **Site Key** (public) and **Secret Key** (server-only).
4. Server — add the secret to `/opt/onservice/.env`:
   ```bash
   TURNSTILE_SECRET_KEY=<secret>
   ```
   then `docker compose -f docker-compose.prod.yml up -d api`.
5. Mobile — the PUBLIC site key goes into the build env as
   `EXPO_PUBLIC_TURNSTILE_SITE_KEY=<site-key>` (EAS build env / `eas.json`), then
   rebuild + redeploy the mobile web bundle (and native builds when you cut them).

Until the keys are set, the live baseline is rate-limiting + OTP (the server
fails the captcha challenge closed in production, so set the keys before relying
on the lockout-captcha path). See escalation E07 for the history.

Run `bash scripts/verify-turnstile.sh` after setting both the server secret and
the public build site key. The verifier rejects Cloudflare's documented test
credentials and checks the real Siteverify endpoint without printing secrets.

### Sign-off

- [ ] Ken — date / site key prefix

---

## Item 6 — Sentry production DSN

**Owner:** API platform engineer
**Estimated time:** 1 day
**Cost:** Free tier (5k errors/month) OK initially; Team plan $26/mo if needed

### Steps

1. Create Sentry organization "onservice".
2. Create projects: `api-production` (Node), `mobile-production` (React Native), `admin-production` (React).
3. Note each DSN.
4. Configure source map uploading via `sentry-cli` in CI.
5. Set up alert rules: 5xx error rate > 1%, escalating.
6. Set up Slack integration for alerts.
7. Rotate env vars:
   ```bash
   SENTRY_API_DSN=<production-api-dsn>
   SENTRY_ENVIRONMENT=production
   SENTRY_RELEASE=v1.0.0
   ```

### Verification

```bash
bash scripts/verify-sentry.sh
```

### Sign-off

- [ ] API platform engineer — date / org slug

---

## Item 7 — PayMongo merchant onboarding finalization

**Owner:** Ken
**Estimated time:** 14–30 business days for KYC + settlement
**Cost:** No setup fee; transaction fees vary (3.5% + ₱15 standard, negotiable at scale)

### Steps

1. PayMongo dashboard → Settings → Onboarding.
2. Submit KYC: SEC/DTI registration, Mayor's permit, BIR registration, beneficial ownership.
3. Set settlement bank account (separate business account, not personal).
4. Negotiate fee tier (standard 3.5% + ₱15; reduced rates at ₱1M+/month volume).
5. Confirm webhook URL: `https://api.onservice.ph/webhooks/paymongo`.
6. Resolve E14 by selecting and implementing an approved PayMongo Checkout
   Session or client Payment Method authorization flow. The current API-created
   browser URL is invalid and must not be used for real-money testing.
7. Test customer authorization, return/cancel/pending handling, verified
   webhooks, escrow hold, refund, reconciliation, and wallet top-up in PayMongo
   test mode.
8. Only after those tests pass, switch to live mode + rotate keys:
   ```bash
   PAYMONGO_PUBLIC_KEY=pk_live_...
   PAYMONGO_SECRET_KEY=sk_live_...
   PAYMONGO_WEBHOOK_SECRET=whs_...
   ```

### Verification

```bash
bash scripts/verify-paymongo.sh
```

The script verifies configuration and account reachability. It does not close
E14 by itself; attach test-mode end-to-end evidence to the sign-off.

### Sign-off

- [ ] Ken — date / live-mode confirmation

---

## Item 8 — Approved tax-document immutable retention

**Owner:** API platform engineer
**Estimated time:** 1 day
**Cost:** Negligible (S3 storage)

### Steps

1. After E22 identifies the approved document type, create a dedicated
   tax-document archive (the historical Terraform name is
   `onservice-bir-receipts-prod`; the legal document name is not yet approved).
2. Enable versioning.
3. Enable Object Lock with default retention 10 years (compliance requirement).
4. Bucket policy denies non-TLS access.
5. Enable KMS-SSE.
6. Configure the approved invoice/document service to write here.

Terraform spec lives in `infra/terraform/s3-bir-receipts.tf` (this dispatch).

### Verification

```bash
bash scripts/verify-s3-bir.sh
```

### Sign-off

- [ ] API platform engineer — date / bucket ARN

---

## Item 9 — Production Postgres PITR

> **Progress (2026-06-04):** A nightly backup is now live and verified — it dumps
> the database AND tars the uploads volume (booking photos + KYC docs) to
> `/opt/onservice/backups/`, keeps 14 days, and the dump has been restore-tested
> (loads into a scratch DB with real rows). This fixes a latent bug where the
> cron had been failing every night (non-executable script). Runbook:
> `docs/runbooks/postgres-restore.md`. Hetzner Automatic Backups/snapshots and
> the logical dump provide recovery layers, but they are not continuous PITR.
> This launch item remains unsigned until the approved recovery objective is
> documented and a restore meeting it is evidenced; do not silently downgrade
> it to a post-launch nice-to-have.

**Owner:** API platform engineer
**Estimated time:** 1–3 days
**Cost:** ~30% premium over standard storage

### Steps

If RDS:
1. Set `BackupRetentionPeriod` = 35 days (max).
2. Enable continuous WAL archiving.
3. Test point-in-time restore on staging.
4. Document recovery in `docs/runbooks/postgres-restore.md`.

If self-hosted: set up `pgbackrest` or `wal-g` to S3, daily full + 5-min WAL, test restore.

### Verification

```bash
bash scripts/verify-postgres-pitr.sh
```

### Sign-off

- [ ] API platform engineer — date / restore test passed

---

## Item 10 — DNS + TLS production cutover

**Owner:** API platform engineer
**Estimated time:** 1 day for DNS; 24-48h propagation
**Cost:** Free (Route53 / Cloudflare; ACM certificates free)

### Steps

1. Purchase / verify domain `onservice.ph`.
2. Subdomains:
   - `api.onservice.ph` → API load balancer
   - `admin.onservice.ph` → admin web app CDN
3. Issue ACM certificates (auto-renew).
4. TLS endpoint: TLS 1.2+ and HSTS preload. Use the certificate authority's
   current revocation mechanism. Let's Encrypt certificates use CRL
   distribution points and no longer support OCSP stapling; do not re-enable
   nginx stapling for those certificates.
5. Cloudflare/AWS WAF: rate limit auth + compliance routes; block known bot UAs + malicious IPs.
6. Test ssllabs.com → must score A+ (HSTS, TLS 1.3, no weak ciphers).

### Verification

```bash
bash scripts/verify-tls.sh
```

### Sign-off

- [ ] API platform engineer — date / ssllabs grade

---

## Item 11 — Admin SSO (optional, recommended)

**Owner:** API platform engineer
**Estimated time:** 2–3 days
**Cost:** Free (Google Workspace OIDC) or $4/user/month

### Steps

1. Set up Google Workspace for `onservice.ph` (if not already).
2. Create OIDC client at https://console.cloud.google.com/apis/credentials.
3. Add SSO button to `apps/admin` login.
4. Server validates Google JWT, checks `@onservice.ph` domain, looks up `admin_users` row.
5. Falls back to email/password + 2FA for non-SSO admins.

Optional but strongly recommended — eliminates password-sharing risk; central revocation when employees leave.

### Sign-off

- [ ] API platform engineer — date (or marked DEFERRED with rationale)

---

## Item 12 — Server-side approved BIR invoice issuance verification

**Owner:** API platform engineer
**Estimated time:** 2 days
**Dependencies:** Item 2 (BIR ATP) + Item 8 (S3 bucket)
**Cost:** None

### Steps

1. Complete Item 2 and close E22 with accountant-approved requirements.
2. Create a staging booking that exercises the approved principal-document
   and authorized serial range.
3. Verify the implemented table and API, not a runbook-invented name. The
   current legacy table is `official_receipts`; it is held and is not proof of
   compliant invoicing.
4. Confirm the stored amounts use the accountant-approved seller/tax basis,
   the number is inside the authorized range, the immutable artifact exists,
   and delivery reaches the intended party.
5. Confirm cancellation/credit handling, reconciliation, document wording,
   and filing export against the accountant-approved test cases.

### Verification

```bash
bash scripts/verify-bir-pipeline.sh
```

This command intentionally fails while E22 is open and no real end-to-end
verifier exists.

### Sign-off

- [ ] API platform engineer — date / sample OR #

---

## Final smoke test sweep

After Items 1–12 complete, run the full Maestro + Playwright suite against staging-prod-mirror:

```bash
bash scripts/run-full-smoke.sh
```

Critical-paths sweep covers the launch-safe flows (signup→booking→completion→review; provider signup→approval→job→payout; cancel→refund; dispute→resolution; existing-wallet-balance payment; recurring booking→3 instances→cancel; multi-device session sync). While E14 is open, wallet top-up is a fail-closed assertion, not a payment E2E flow.

Success criterion: all flows pass with no visual diff and no console errors.

### Sign-off

- [ ] All catalogued 113 app/admin surfaces have the required behavioral and
      visual evidence; F#3 native baselines are complete
- [ ] All launch-safe critical-path E2E flows pass and the E14 top-up/external-payment hold fails closed
- [ ] Zero console errors in any flow

---

## Operational launch decision matrix

After every Item verified + smoke complete:

| Item | Status | Risk if missing |
|---|---|---|
| 1. NPC DPO registration | <pass/fail> | Regulatory action, ₱5M penalty per breach |
| 2. BIR principal invoice authority | <pass/fail> | Cannot issue compliant invoices; tax exposure |
| 3. DTI permit | <pass/fail> | Cannot operate as registered business |
| 4. Mayor's permit | <pass/fail> | Cannot operate in the launch city (default: Cebu City) |
| 5. Cloudflare Turnstile | <pass/fail> | Bot abuse; SMS-cost vector |
| 6. Sentry | <pass/fail> | Production errors invisible; debugging blind |
| 7. PayMongo | <pass/fail> | Cannot accept payments |
| 8. Tax-document immutable retention | <pass/fail> | BIR audit failure |
| 9. Postgres PITR | <pass/fail> | Data loss; cannot recover |
| 10. DNS + TLS | <pass/fail> | Customers cannot reach app |
| 11. Admin SSO | <pass/fail> | Recoverable; non-blocking |
| 12. Approved BIR invoice pipeline | <pass/fail> | Same as Item 2 chain |

**Launch readiness rule:** Items 1–10 + 12 must all PASS. Item 11 may defer. If any other FAILs, postpone launch — none are graceful-degradation candidates.

---

## Tag application

When every sign-off above is checked AND `bash scripts/verify-launch-readiness.sh` returns 0:

```bash
git tag -a v1.0.0-launch-ready -m "Phase 14 complete — onService PH cleared for launch (default market: Metro Cebu)"
git push origin v1.0.0-launch-ready
```

This tag is applied by Ken (not the AI coder), reflecting the human go-decision after all operational sign-offs land.

---

## Migration 077 history and current promo state

The sequence deliberately left 077 unused during D13; do not create an empty
placeholder. Migration 111 later added `promo_redemptions`, and the server now
has canonical promo resolution/recording. Customer checkout input and
end-to-end customer linkage remain disabled under `promo_redemption_enabled`;
see `LAUNCH-LIMITATIONS.md` §30.
