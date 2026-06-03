# Launch Cutover Runbook (Phase 14 Dispatch 14)

**Status:** AI deliverable complete (verification harness + runbook). Operational items 1–12 are Ken / API platform engineer responsibilities. The `v1.0.0-launch-ready` tag is applied to master ONLY after every sign-off below is checked.

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
   - Privacy policy URL (must be publicly accessible).
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

## Item 2 — BIR invoice series allocation (Official Receipts)

**Owner:** Ken (or accountant)
**Estimated time:** 14–21 business days
**Dependencies:** DTI / Mayor's permit current; BIR registration up to date
**Cost:** ~₱500 ATP fee + accountant time

### Steps

1. Visit RDO (Revenue District Office) where onService PH is registered.
2. File BIR Form 1906 — Application for Authority to Print Receipts and Invoices.
3. Specify: Official Receipt for service; serial range starting at `0000001`; quantity = 50,000 OR (v1.0 launch + 6 months runway).
4. Pay ATP processing fee.
5. Receive ATP within 14 days.
6. Configure server `.env.production`:
   ```bash
   BIR_OR_SERIES_PREFIX=ONS
   BIR_OR_SERIES_START=0000001
   BIR_OR_SERIES_END=0050000
   ```
7. Verify OR generation pipeline (Item 12).

### Verification

```bash
bash scripts/verify-bir-or-series.sh
```

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

## Item 5 — hCaptcha production contract

**Owner:** Ken
**Estimated time:** Same-day signup; ~7 days for paid tier KYC
**Cost:** Free tier OK for v1.0; Pro at $99/mo if traffic warrants

### Steps

1. Sign up at https://www.hcaptcha.com/ with company email.
2. Create production site for `*.onservice.ph`.
3. Note site key (public) and secret key (server-only).
4. Add to `.env.production`:
   ```bash
   HCAPTCHA_SITE_KEY=<public>
   HCAPTCHA_SECRET_KEY=<secret>
   ```
5. Rotate from dev key in mobile builds (`apps/mobile/eas.json` env reference).

### Verification

```bash
bash scripts/verify-hcaptcha.sh
```

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
6. Test in sandbox mode.
7. Switch to live mode + rotate keys:
   ```bash
   PAYMONGO_PUBLIC_KEY=pk_live_...
   PAYMONGO_SECRET_KEY=sk_live_...
   PAYMONGO_WEBHOOK_SECRET=whs_...
   ```

### Verification

```bash
bash scripts/verify-paymongo.sh
```

### Sign-off

- [ ] Ken — date / live-mode confirmation

---

## Item 8 — S3 BIR bucket Object Lock + retention

**Owner:** API platform engineer
**Estimated time:** 1 day
**Cost:** Negligible (S3 storage)

### Steps

1. Create dedicated bucket `onservice-bir-receipts-prod`.
2. Enable versioning.
3. Enable Object Lock with default retention 10 years (compliance requirement).
4. Bucket policy denies non-TLS access.
5. Enable KMS-SSE.
6. Configure OR generation service to write here.

Terraform spec lives in `infra/terraform/s3-bir-receipts.tf` (this dispatch).

### Verification

```bash
bash scripts/verify-s3-bir.sh
```

### Sign-off

- [ ] API platform engineer — date / bucket ARN

---

## Item 9 — Production Postgres PITR

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
4. ALB listener: TLS 1.2+, HSTS preload, OCSP stapling.
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

## Item 12 — Server-side BIR e-receipt issuance verification

**Owner:** API platform engineer
**Estimated time:** 2 days
**Dependencies:** Item 2 (BIR ATP) + Item 8 (S3 bucket)
**Cost:** None

### Steps

1. Create test booking on staging that hits production-like OR series.
2. Confirm `bir_receipts` table receives row with:
   - Sequential OR number
   - PDF generated to S3 BIR bucket
   - VAT (12%) calculated correctly
   - Customer email sent with PDF attached
3. Run reconciliation: total VAT = sum(OR amounts) × 12% / 112%.
4. Verify OR PDF format matches BIR template.

### Verification

```bash
bash scripts/verify-bir-pipeline.sh
```

### Sign-off

- [ ] API platform engineer — date / sample OR #

---

## Final smoke test sweep

After Items 1–12 complete, run the full Maestro + Playwright suite against staging-prod-mirror:

```bash
bash scripts/run-full-smoke.sh
```

Critical-paths sweep covers 7 end-to-end flows (signup→booking→completion→review; provider signup→approval→job→payout; cancel→refund; dispute→resolution; wallet top-up→spend→withdraw; recurring booking→3 instances→cancel; multi-device session sync).

Success criterion: all flows pass with no visual diff and no console errors.

### Sign-off

- [ ] All 110 screens pass visual baselines
- [ ] All 7 critical-path E2E flows pass
- [ ] Zero console errors in any flow

---

## Operational launch decision matrix

After every Item verified + smoke complete:

| Item | Status | Risk if missing |
|---|---|---|
| 1. NPC DPO registration | <pass/fail> | Regulatory action, ₱5M penalty per breach |
| 2. BIR OR series | <pass/fail> | Cannot issue compliant receipts; tax fraud exposure |
| 3. DTI permit | <pass/fail> | Cannot operate as registered business |
| 4. Mayor's permit | <pass/fail> | Cannot operate in the launch city (default: Cebu City) |
| 5. hCaptcha | <pass/fail> | Bot abuse; SMS-cost vector |
| 6. Sentry | <pass/fail> | Production errors invisible; debugging blind |
| 7. PayMongo | <pass/fail> | Cannot accept payments |
| 8. S3 BIR Object Lock | <pass/fail> | BIR audit failure |
| 9. Postgres PITR | <pass/fail> | Data loss; cannot recover |
| 10. DNS + TLS | <pass/fail> | Customers cannot reach app |
| 11. Admin SSO | <pass/fail> | Recoverable; non-blocking |
| 12. BIR e-receipt | <pass/fail> | Same as Item 2 chain |

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

## Migration 077 — promo_redemptions (deferred to v1.1)

The migration sequence has a deliberate gap at 077. Per `.ai-coder/decisions/D13-feature-decisions.md`, promo redemption is pulled for v1.0; the `promo_redemptions` table is reserved for the v1.1 wiring dispatch. Do NOT add a placeholder migration — empty migrations make the suite slower without value, and the gap is explicitly documented here so a future maintainer doesn't think a migration was lost.
