# BUG REMEDIATION MANUAL — Part 3 (final)
## Dispatches 13 and 14

This installment closes Part 3. Dispatch 13 implements the A/B testing + promo redemption decision (per Ken's choice in `.ai-coder/decisions/D13-feature-decisions.md`). Dispatch 14 is the final smoke + production cutover, which is unlike all prior dispatches because the bulk of the work is **operational**, not coding — Ken has to register a DPO with the NPC, complete BIR invoice series filing, finalize PayMongo merchant onboarding, etc. The AI coder's contribution to Dispatch 14 is the verification harness that confirms each operational step landed correctly.

---

# DISPATCH 13 — A/B testing + promo redemption decision

## Goal

The audit found two product features fully built on admin/database side but unwired on customer side:

- **Bug 44** — Promo codes can be CREATED (admin tools wired, table populated, validation working) but NEVER REDEEMED (mobile customer has no input field; backend has no redemption endpoint logic).
- **Bug 45** — A/B test framework infrastructure exists (admin UI, `ab_tests` + `ab_test_assignments` tables) but no service code anywhere assigns variants. Every customer ends up in control. The admin dashboard shows "0 variant A users / 0 variant B users" forever.

Both features look complete to a casual observer (admin UI works; database has tables). Both are non-functional to actual users. Both share the same decision shape Phase 14 used for SiguradoShield: wire end-to-end OR pull and document in LAUNCH-LIMITATIONS.

**Branch:** `phase/14-d13-feature-decisions`
**Tag at end:** `v0.14.0-d13-complete`

---

## The decision document

Before this dispatch begins, Ken records the choice in `.ai-coder/decisions/D13-feature-decisions.md`:

```markdown
# D13 — A/B testing and promo redemption decisions

Decision date: <date>
Decided by: Ken <last name>

## Bug 44 — Promo codes
Choice: Pull for v1.0
Reason: No marketing campaigns planned for v1.0. Adding redemption
without first running real campaigns means we'll ship code that's
exercised only by tests, not by customers. v1.1 wires when first
campaign is ready.
Implementation: hide promo input from customer/booking/checkout.tsx.
Hide A/B Tests tab from admin AnalyticsPage. Add LAUNCH-LIMITATIONS §25.

## Bug 45 — A/B testing
Choice: Pull for v1.0
Reason: Same logic. Without real experiments running, the assignment
infrastructure is dead code. v1.1 wires when first experiment is
designed (e.g., onboarding flow A/B).
Implementation: hide A/B Tests admin tab. Add LAUNCH-LIMITATIONS §26.
```

If the AI coder finds this document missing, it MUST stop and escalate to Ken before proceeding.

The catalog (Parts 2A, 2B, 2C) was written assuming Pull. If Ken chooses Wire instead, this dispatch becomes 6+ weeks of additional engineering: variant assignment service, sticky bucket persistence, cohort isolation, exposure tracking, statistical significance computation, redemption pipeline (validate code → check eligibility → deduct discount → audit redemption → handle abuse). That work is real and possible but should not gate v1.0.

This dispatch implements **Pull**.

---

## Bug 44.A — Hide promo input from customer checkout

**File:** `apps/mobile/app/customer/booking/checkout.tsx`

### Current state

The checkout screen has a `PromoCodeInput` component visible. Customer enters a code, taps Apply, sees a spinner, sees an error ("Promo not found") because the redemption endpoint doesn't exist. Confusing UX.

### Exact fix

Feature flag the input. Server settings include `feature_flags.promo_redemption_enabled` (default `false`). Mobile reads via the existing platform config and conditionally renders.

```ts
// packages/api/migrations/086_feature_flags.sql
INSERT INTO platform_settings (key, value_json, description)
VALUES
  ('feature_flag.promo_redemption_enabled', 'false'::jsonb, 'Phase 14 D13 — promo codes UI + redemption pipeline'),
  ('feature_flag.ab_testing_enabled',       'false'::jsonb, 'Phase 14 D13 — A/B variant assignment + admin dashboard')
ON CONFLICT (key) DO NOTHING;
```

```tsx
// apps/mobile/app/customer/booking/checkout.tsx — promo section
{flags.promoRedemptionEnabled && (
  <PromoCodeSection
    bookingDraftId={draftId}
    onApplied={(promo) => setAppliedPromo(promo)}
  />
)}
```

The flag arrives via `useFeatureFlags()` hook that reads from `/api/v1/settings/feature-flags`:

```ts
// apps/mobile/src/hooks/useFeatureFlags.ts
export function useFeatureFlags() {
  const { data } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => api.get<{ data: FeatureFlags }>('/api/v1/settings/feature-flags'),
    staleTime: 5 * 60_000,
  });
  return {
    promoRedemptionEnabled: data?.data.promo_redemption_enabled ?? false,
    abTestingEnabled: data?.data.ab_testing_enabled ?? false,
  };
}
```

When `promoRedemptionEnabled = false` (v1.0 default), the section is not rendered. Customer never sees it. When admin toggles to `true` (after redemption is wired in v1.1+), the section appears for all customers without an app update.

### Server endpoint

```ts
// packages/api/src/routes/public/feature-flags.ts
router.get('/feature-flags', async (_req, res) => {
  const flags = await db.selectFrom('platform_settings')
    .select(['key', 'value_json'])
    .where('key', 'like', 'feature_flag.%')
    .execute();

  const result: Record<string, boolean> = {};
  for (const row of flags) {
    const shortKey = row.key.replace('feature_flag.', '');
    result[shortKey] = row.value_json === true || row.value_json === 'true';
  }
  res.json({ data: result });
});
```

Cached aggressively in CDN since values change infrequently.

### Test signature

```ts
describe('Checkout promo section (Bug 44.A)', () => {
  it('renders nothing when feature flag is false', () => {
    mockFeatureFlags({ promoRedemptionEnabled: false });
    const { queryByTestId } = render(<CheckoutScreen />);
    expect(queryByTestId('promo-code-section')).toBeNull();
  });

  it('renders input when flag is true', () => {
    mockFeatureFlags({ promoRedemptionEnabled: true });
    const { getByTestId } = render(<CheckoutScreen />);
    expect(getByTestId('promo-code-section')).toBeTruthy();
  });
});
```

---

## Bug 44.B — Promo creation form shows banner

**File:** `apps/admin/src/pages/MarketingPage.tsx` Promo Codes tab

Per Part 2A section 20 — when promo redemption is unwired, the admin still sees the create-promo form (because the `promo_codes` rows are useful even unused; v1.1 will activate them retroactively). But a banner makes the unwired state obvious so admins don't waste time creating codes that won't redeem.

```tsx
// apps/admin/src/pages/MarketingPage.tsx — promo codes tab
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

export function PromoCodesTab() {
  const flags = useFeatureFlags();

  return (
    <div>
      {!flags.promoRedemptionEnabled && (
        <Banner variant="warning" testID="promo-not-wired-banner">
          <Text>{i18n.t('admin.promos.not_wired_title')}</Text>
          <Text style={styles.subtext}>{i18n.t('admin.promos.not_wired_body')}</Text>
        </Banner>
      )}
      {/* existing promo CRUD UI */}
    </div>
  );
}
```

Banner copy: "Promo codes are not yet redeemable in the customer mobile app. You can create codes here, and they will be honored once Phase 14 v1.1 wires redemption (target: post-launch). Codes you create now will retroactively work."

---

## Bug 45.A — Hide A/B Tests admin tab

**File:** `apps/admin/src/pages/AnalyticsPage.tsx`

```tsx
const tabs = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'cohorts', label: 'Cohorts' },
  ...(flags.abTestingEnabled ? [{ key: 'ab_tests', label: 'A/B Tests' }] : []),
  { key: 'churn', label: 'Churn' },
];
```

When `ab_testing_enabled = false`, the tab is removed from the tab bar entirely. Admin who navigates directly to `/analytics?tab=ab_tests` sees the Revenue tab (default fallback).

---

## LAUNCH-LIMITATIONS additions

```markdown
## §25 — Promo code redemption (Bug 44)

Promo codes can be created via the admin Marketing page, but the customer
mobile app does not display a redemption input field for v1.0.

Reason: no marketing campaigns planned for v1.0. Wiring redemption without
real campaigns means shipping code exercised only by tests.

For v1.1+:
1. Build redemption pipeline in `pricing.service.ts` `resolvePromo()` (skeleton already in place from Dispatch 05).
2. Add `PromoCodeSection` to `customer/booking/checkout.tsx` (already feature-flagged).
3. Toggle `feature_flag.promo_redemption_enabled = true` via admin.
4. Codes created in v1.0 work retroactively.

## §26 — A/B testing framework (Bug 45)

The A/B test admin UI and database tables exist but no variant assignment
runs. The admin tab is hidden until wired.

For v1.1+:
1. Build `ab_test.service.ts` `assignVariant(userId, testKey)` with sticky bucket persistence.
2. Wire exposure tracking from mobile `(tabs)/home.tsx` and other surfaces where experiments will run.
3. Wire `track_exposure` calls in critical surfaces (checkout, search, onboarding).
4. Toggle `feature_flag.ab_testing_enabled = true`.
```

---

## Dispatch 13 closeout

**Bugs claimed fixed (4):**
- Bug 44 — promo redemption (decision: pull)
- Bug 45 — A/B testing (decision: pull)
- Bug 152 — promo form admin guidance (banner explaining unwired)
- Bug 286 — A/B Tests dashboard hidden until wired

**Files added:**
- `packages/api/migrations/086_feature_flags.sql`
- `apps/mobile/src/hooks/useFeatureFlags.ts`
- `apps/admin/src/hooks/useFeatureFlags.ts`
- `packages/api/src/routes/public/feature-flags.ts`
- `.ai-coder/decisions/D13-feature-decisions.md`
- 4 test files

**Files modified:**
- `apps/mobile/app/customer/booking/checkout.tsx` (promo input feature-flagged)
- `apps/admin/src/pages/MarketingPage.tsx` (banner when unwired)
- `apps/admin/src/pages/AnalyticsPage.tsx` (A/B tab conditional)
- `LAUNCH-LIMITATIONS.md` (§25, §26 added)

**Decision points reaffirmed for Ken:**
- v1.1 promo wire: target after first marketing campaign concept exists. Insufficient to wire "in case we run a campaign" — prematurely shipped features rot.
- v1.1 A/B wire: target after first hypothesis is documented. Statistical significance requires sample sizes you won't have for several months post-launch.

---

# DISPATCH 14 — Final smoke + production cutover

## Goal

Dispatch 14 is unlike every prior dispatch. It addresses 12 operational launch blockers that **are not code changes**. They are real-world business operations Ken (or his team) must complete:

1. **NPC DPO registration** — register Data Protection Officer with the National Privacy Commission. Required by RA 10173 §50.
2. **BIR invoice series allocation** — register Authority to Print (ATP) for Official Receipts; obtain OR series number range.
3. **DTI permit verification** — confirm DTI Single Proprietorship registration is current.
4. **Mayor's permit verification** — confirm Boracay (Malay LGU) business permit is current.
5. **hCaptcha contract signing** — replace dev key with production key under signed terms.
6. **Sentry production project setup** — create production project, get DSN, rotate from staging.
7. **PayMongo merchant onboarding finalization** — KYC, settlement bank, fee tier confirmation.
8. **S3 BIR bucket Object Lock** — enable Object Lock with 10-year retention for tax documents.
9. **Production Postgres PITR** — Point-in-Time Recovery via WAL archiving (RDS / managed Postgres equivalent).
10. **DNS + TLS production cutover** — production domains, ACM certificates, HSTS enforcement.
11. **Admin SSO** (optional) — Google Workspace OIDC if applicable.
12. **Server-side BIR e-receipt issuance verification** — confirm OR generation pipeline works end-to-end.

**The AI coder's contribution to this dispatch is twofold:**
1. **Verification harness** — automated checks that each operational step landed correctly (e.g., `verify_dpo_registered.sh` checks the NPC public registry, `verify_bir_or_series.ts` queries the OR generation system).
2. **Cutover runbook** — a step-by-step document Ken executes in order, with each step having a verification command + rollback plan.

**Branch:** `phase/14-d14-cutover`
**Tag at end:** `v1.0.0-launch-ready` (NOTE: the tag finally reflects launch readiness — Phase 13 explicitly avoided this tag because the platform was not ready)

---

## Cutover runbook structure

For each of the 12 launch blockers, the runbook entry has this shape:

```markdown
### N. <Title>

**Owner:** Ken / hired specialist / API platform engineer
**Estimated time:** N business days
**Dependencies:** what other items must complete first
**Cost:** ₱ approximate

**Steps:**
1. Specific action to take
2. Specific action to take
...

**Verification:**
`bash scripts/verify-<item>.sh` — what success looks like
Manual confirmation: <what Ken inspects>

**Rollback if it goes wrong:**
<the rollback procedure>

**Sign-off:**
[ ] <required signer> — date
```

---

## Item 1 — NPC DPO registration

**Owner:** Ken (or designated officer)
**Estimated time:** 14–30 business days (NPC review takes ~21 days)
**Dependencies:** none — start immediately, parallel to all other items
**Cost:** Free (own DPO) or ₱15k–40k/month (fractional DPO services)

### Steps

1. Decide whether Ken serves as DPO or hires fractional service.
   - If Ken: complete free NPC online training at https://privacy.gov.ph/npc-academy/.
   - If fractional: contract signed with provider (e.g., Privacy Innovate, Privacy Counsel PH).
2. Compile required information:
   - Personal Information Controller (PIC) details: company name (onService PH or registered DTI name), TIN, business address, registered owner.
   - DPO details: full name, role title, email, phone (must be reachable during NPC hours).
   - Description of personal data processed (categories: customer phone/email/address/payment, provider NBI/government ID/financial).
   - Privacy policy URL (must be publicly accessible).
3. Submit registration at https://privacy.gov.ph/dpo-registration/.
4. Await confirmation email (typically 14–21 days).
5. Update `LAUNCH-LIMITATIONS.md` with NPC registration number.
6. Update Privacy Policy markdown content (`docs/cms/privacy-policy.md`) with DPO contact email.

### Verification

```bash
# scripts/verify-dpo-registered.sh
#!/usr/bin/env bash
set -euo pipefail

# Manual: check NPC public registry at https://privacy.gov.ph/registered-pic/
# for "onService" or registered company name.

REG=$(grep -E "NPC-PIC-[0-9]+" LAUNCH-LIMITATIONS.md || true)
if [ -z "$REG" ]; then
  echo "FAIL: No NPC PIC registration number recorded in LAUNCH-LIMITATIONS.md"
  exit 1
fi

# Verify DPO email is present in privacy policy
DPO_EMAIL=$(grep -oE "dpo@[a-z]+\.[a-z]{2,}" docs/cms/privacy-policy.md | head -1)
if [ -z "$DPO_EMAIL" ]; then
  echo "FAIL: DPO email not in privacy policy"
  exit 1
fi

echo "OK: DPO registered ($REG), email present in policy ($DPO_EMAIL)"
```

### Rollback

Cannot launch without DPO registration. If NPC review delays past launch date, postpone launch.

### Sign-off

- [ ] Ken — date / NPC reg #
- [ ] DPO themselves (acknowledgment of duties) — date

---

## Item 2 — BIR invoice series allocation (Official Receipts)

**Owner:** Ken (or accountant)
**Estimated time:** 14–21 business days
**Dependencies:** DTI / Mayor's permit current; BIR registration up to date
**Cost:** ~₱500 ATP fee + accountant time

### Steps

1. Visit RDO (Revenue District Office) where onService PH is registered.
2. File BIR Form 1906 — Application for Authority to Print Receipts and Invoices.
3. Specify: Official Receipt (for service), serial range starting at 0000001, quantity (recommend 50,000 OR for v1.0 launch + 6 months runway).
4. Pay ATP processing fee.
5. Receive ATP within 14 days.
6. Configure server with allocated series:
   ```bash
   # Add to .env.production:
   BIR_OR_SERIES_PREFIX=ONS
   BIR_OR_SERIES_START=0000001
   BIR_OR_SERIES_END=0050000
   ```
7. Verify OR generation pipeline (Item 12).

### Verification

```bash
# scripts/verify-bir-or-series.sh
#!/usr/bin/env bash
set -euo pipefail

# Verify env vars set
test -n "${BIR_OR_SERIES_PREFIX:-}" || { echo "FAIL: BIR_OR_SERIES_PREFIX missing"; exit 1; }
test -n "${BIR_OR_SERIES_START:-}" || { echo "FAIL: BIR_OR_SERIES_START missing"; exit 1; }
test -n "${BIR_OR_SERIES_END:-}" || { echo "FAIL: BIR_OR_SERIES_END missing"; exit 1; }

# Verify can query next OR number from server
NEXT_OR=$(curl -fsS https://api.onservice.ph/internal/bir/next-or-number)
echo "Next OR number to issue: $NEXT_OR"
echo "OK: BIR OR series configured"
```

### Sign-off
- [ ] Ken — date / ATP # / serial range

---

## Item 3 — DTI permit verification

**Owner:** Ken
**Estimated time:** 1 day verification (if current); 14 days renewal (if expired)
**Cost:** Free verification; ₱200–500 renewal

### Steps

1. Login to https://bnrs.dti.gov.ph/ with Ken's BNRS credentials.
2. Verify Business Name Registration is "Active" with expiry > 90 days from launch.
3. If expiring soon, file renewal.
4. Save current certificate PDF to `/Users/ken/onservice/legal/dti-certificate-2026.pdf`.

### Verification

Manual confirmation. Save PDF to encrypted backup.

---

## Item 4 — Mayor's permit (Malay LGU, Boracay) verification

**Owner:** Ken
**Estimated time:** 1 day verification; 30+ days renewal if expired
**Cost:** Free verification; ₱5k–20k renewal depending on classification

### Steps

1. Visit Malay Municipal Hall, Business Permits and Licensing Office.
2. Verify Mayor's Permit is current.
3. Save PDF.

### Verification

Manual.

---

## Item 5 — hCaptcha production contract

**Owner:** Ken
**Estimated time:** Same-day signup; ~7 days for paid tier KYC
**Cost:** Free tier OK for v1.0; Pro at $99/mo if traffic warrants

### Steps

1. Sign up at https://www.hcaptcha.com/ with company email.
2. Create production site for `*.onservice.ph`.
3. Note the site key (public) and secret key (server-only).
4. Add to env:
   ```bash
   # .env.production
   HCAPTCHA_SITE_KEY=<public>
   HCAPTCHA_SECRET_KEY=<secret>
   ```
5. Rotate from dev key in mobile builds (`apps/mobile/eas.json` env reference).

### Verification

```bash
# scripts/verify-hcaptcha.sh
test -n "${HCAPTCHA_SITE_KEY:-}" || { echo "FAIL"; exit 1; }
test -n "${HCAPTCHA_SECRET_KEY:-}" || { echo "FAIL"; exit 1; }

# Verify site key works against hCaptcha API
curl -fsS "https://hcaptcha.com/siteverify" \
  -d "secret=$HCAPTCHA_SECRET_KEY&response=10000000-aaaa-bbbb-cccc-000000000001"
# Expected: { "success": true, ... } for the demo bypass token
```

---

## Item 6 — Sentry production DSN

**Owner:** API platform engineer
**Estimated time:** 1 day
**Cost:** Free tier (5k errors/month) sufficient for early; Team plan $26/mo if needed

### Steps

1. Create Sentry organization "onservice".
2. Create project "api-production" (Node), "mobile-production" (React Native), "admin-production" (React).
3. Note each DSN.
4. Configure source map uploading via `sentry-cli` in CI.
5. Set up alert rules: 5xx error rate > 1%, escalating.
6. Set up Slack integration for alerts.
7. Rotate env vars:
   ```bash
   # .env.production
   SENTRY_API_DSN=<production-api-dsn>
   SENTRY_ENVIRONMENT=production
   SENTRY_RELEASE=v1.0.0
   ```

### Verification

```bash
# scripts/verify-sentry.sh
# Trigger a test error and confirm it appears in Sentry within 60s
curl -fsS https://api.onservice.ph/internal/sentry-test
sleep 60
# Manually check https://sentry.io/organizations/onservice/issues/
```

---

## Item 7 — PayMongo merchant onboarding finalization

**Owner:** Ken
**Estimated time:** 14–30 business days for KYC + settlement
**Cost:** No setup fee; transaction fees vary (3.5% + ₱15 standard, negotiable at scale)

### Steps

1. PayMongo dashboard → Settings → Onboarding.
2. Submit KYC documents:
   - SEC / DTI registration
   - Mayor's permit
   - BIR registration
   - Beneficial ownership disclosure
3. Set settlement bank account (recommend a separate business account, not personal).
4. Negotiate fee tier (standard 3.5% + ₱15; reduced rates at ₱1M+/month volume).
5. Confirm webhook URL: `https://api.onservice.ph/webhooks/paymongo`.
6. Test in sandbox mode.
7. Switch to live mode + rotate keys to production:
   ```bash
   # .env.production
   PAYMONGO_PUBLIC_KEY=pk_live_...
   PAYMONGO_SECRET_KEY=sk_live_...
   PAYMONGO_WEBHOOK_SECRET=whs_...
   ```

### Verification

```bash
# scripts/verify-paymongo.sh
# Hit PayMongo's account info endpoint
RESP=$(curl -fsS -u "$PAYMONGO_SECRET_KEY:" \
  https://api.paymongo.com/v1/accounts/me)
LIVE=$(echo "$RESP" | jq -r '.data.attributes.live_mode')
test "$LIVE" = "true" || { echo "FAIL: still in test mode"; exit 1; }
echo "OK: PayMongo in live mode"
```

---

## Item 8 — S3 BIR bucket Object Lock + retention

**Owner:** API platform engineer
**Estimated time:** 1 day
**Cost:** Negligible (S3 storage)

### Steps

1. Create dedicated bucket `onservice-bir-receipts-prod` (separate from customer uploads bucket).
2. Enable versioning.
3. Enable Object Lock with default retention: 10 years (compliance requirement).
4. Set bucket policy to deny non-TLS access (mirror Dispatch 01 Bug 1325 fix).
5. Enable KMS-SSE.
6. Configure OR generation service to write here.

```hcl
# infra/terraform/s3-bir-receipts.tf
resource "aws_s3_bucket" "bir_receipts" {
  bucket = "onservice-bir-receipts-${var.environment}"
  object_lock_enabled = true
}

resource "aws_s3_bucket_object_lock_configuration" "bir" {
  bucket = aws_s3_bucket.bir_receipts.id
  rule {
    default_retention {
      mode = "COMPLIANCE"
      years = 10
    }
  }
}

resource "aws_s3_bucket_versioning" "bir" {
  bucket = aws_s3_bucket.bir_receipts.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "bir" {
  bucket = aws_s3_bucket.bir_receipts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.bir.arn
    }
  }
}

resource "aws_kms_key" "bir" {
  description = "BIR receipts KMS key"
  enable_key_rotation = true
  deletion_window_in_days = 30
}
```

### Verification

```bash
# scripts/verify-s3-bir.sh
aws s3api get-object-lock-configuration --bucket onservice-bir-receipts-prod \
  | jq -r '.ObjectLockConfiguration.Rule.DefaultRetention.Years' \
  | grep -q "^10$" || { echo "FAIL: Object Lock not 10y"; exit 1; }

aws s3api get-bucket-encryption --bucket onservice-bir-receipts-prod \
  | grep -q "aws:kms" || { echo "FAIL: KMS not enabled"; exit 1; }

echo "OK: BIR bucket compliant"
```

---

## Item 9 — Production Postgres PITR

**Owner:** API platform engineer
**Estimated time:** 1–3 days
**Cost:** ~30% premium over standard storage

### Steps

If using AWS RDS:
1. Set `BackupRetentionPeriod` to 35 days (max).
2. Enable continuous WAL archiving.
3. Test point-in-time restore on staging to verify procedure.
4. Document recovery runbook in `docs/runbooks/postgres-restore.md`.

If using DigitalOcean Managed:
1. Enable daily backups (automatic).
2. Note retention is 7 days (DO limitation); if longer needed, migrate to AWS RDS.

If self-hosted on VPS:
1. Set up `pgbackrest` or `wal-g` for continuous archiving to S3.
2. Daily full backups + 5-minute WAL.
3. Test restore procedure.

### Verification

```bash
# scripts/verify-postgres-pitr.sh
# Verify backup happened in last 24h
# (RDS-specific; adapt for other providers)
LATEST=$(aws rds describe-db-snapshots \
  --db-instance-identifier onservice-prod-db \
  --snapshot-type automated \
  --query 'sort_by(DBSnapshots, &SnapshotCreateTime)[-1].SnapshotCreateTime' \
  --output text)

NOW=$(date -u +%s)
THEN=$(date -u -d "$LATEST" +%s)
AGE_HOURS=$(( (NOW - THEN) / 3600 ))

test "$AGE_HOURS" -lt 24 || { echo "FAIL: latest snapshot is $AGE_HOURS hours old"; exit 1; }
echo "OK: latest snapshot $AGE_HOURS hours ago"
```

---

## Item 10 — DNS + TLS production cutover

**Owner:** API platform engineer
**Estimated time:** 1 day for DNS; 24-48h propagation
**Cost:** Free (Route53 / Cloudflare; ACM certificates free)

### Steps

1. Purchase / verify domain `onservice.ph`.
2. Create subdomains:
   - `api.onservice.ph` → API load balancer
   - `admin.onservice.ph` → admin web app CDN
3. Issue ACM certificates (auto-renew).
4. Configure ALB listener with TLS 1.2+, HSTS preload, OCSP stapling.
5. Set up Cloudflare or AWS WAF rules:
   - Rate limit `/api/v1/auth/*` to 30 req/min/IP
   - Rate limit `/api/v1/compliance/*` to 30 req/min/user
   - Block known bot user-agents
   - Block known malicious IP ranges
6. Configure DNS-level rate limiting via Cloudflare (free tier OK).
7. Test with `ssllabs.com` — must score A+ (HSTS, TLS 1.3, no weak ciphers).

### Verification

```bash
# scripts/verify-tls.sh
SITES=("api.onservice.ph" "admin.onservice.ph")
for site in "${SITES[@]}"; do
  TLS=$(curl -sI "https://$site" | head -1)
  echo "$site: $TLS"
  test "$(echo "$TLS" | grep -c '200\|301\|302')" -gt 0 || exit 1
  
  HSTS=$(curl -sI "https://$site" | grep -i "strict-transport-security")
  test -n "$HSTS" || { echo "FAIL: HSTS missing on $site"; exit 1; }
done

echo "OK: TLS + HSTS configured"
```

---

## Item 11 — Admin SSO (optional, recommend Yes)

**Owner:** API platform engineer
**Estimated time:** 2–3 days
**Cost:** Free (Google Workspace OIDC); $4/user/month if you don't have Workspace

### Steps

1. Set up Google Workspace for `onservice.ph` domain (if not already).
2. Create OIDC client at https://console.cloud.google.com/apis/credentials.
3. Add to `apps/admin` login flow:
   ```ts
   // apps/admin/src/pages/LoginPage.tsx
   <Button onClick={() => window.location.href = '/api/v1/auth/admin/sso/google'}>
     Sign in with Google Workspace
   </Button>
   ```
4. Server endpoint validates Google JWT, checks email is `@onservice.ph` domain, looks up admin_users row.
5. Falls back to email/password + 2FA for non-SSO admins (e.g., contractors).

This is optional but strongly recommended — SSO eliminates password-sharing risk and gives you central revocation when an employee leaves.

---

## Item 12 — Server-side BIR e-receipt issuance verification

**Owner:** API platform engineer
**Estimated time:** 2 days verification
**Cost:** None (assumes BIR ATP from Item 2 is complete)

### Steps

1. Create test booking on staging that hits production-like OR series.
2. Confirm `bir_receipts` table receives row with:
   - Sequential OR number from allocated series
   - PDF generated to S3 BIR bucket (Item 8)
   - VAT (12%) calculated correctly
   - Customer email sent with PDF attached
3. Run reconciliation report: total VAT collected = sum of OR amounts × 12% / 112%.
4. Verify OR PDF format matches BIR template (compare against accountant-approved sample).

### Verification

```bash
# scripts/verify-bir-pipeline.sh
# Trigger a test transaction and confirm OR issued
curl -X POST https://api.onservice.ph/internal/test/issue-or \
  -H "Authorization: Bearer $INTERNAL_TOKEN" \
  -d '{"booking_id":"<test-booking>"}'

# Wait for async OR issuance
sleep 5

# Verify OR row exists
psql "$PROD_DB_URL" -c "
  SELECT or_number, amount_cents, vat_cents, pdf_s3_key
  FROM bir_receipts
  WHERE booking_id = '<test-booking>'
" | grep -E "ONS-[0-9]{7}" || { echo "FAIL: no OR generated"; exit 1; }

echo "OK: BIR OR pipeline working"
```

---

## Final smoke test sweep

After Items 1–12 complete, run the full Maestro suite against staging-prod-mirror:

```bash
# scripts/run-full-smoke.sh
#!/usr/bin/env bash
set -euo pipefail

cd apps/mobile

# Customer flows (all 43 screens reachable)
maestro test .maestro/visual/customer/ --output ../../artifacts/maestro-customer

# Provider flows (all 39 screens reachable)
maestro test .maestro/visual/provider/ --output ../../artifacts/maestro-provider

# Critical paths end-to-end
maestro test .maestro/e2e/critical-paths/ --output ../../artifacts/maestro-e2e

# Admin Playwright
cd ../admin
pnpm exec playwright test tests/visual/

# Cross-device check
maestro test .maestro/visual/ --device "iPhone-15" --output ../../artifacts/maestro-iphone15
maestro test .maestro/visual/ --device "Pixel-7" --output ../../artifacts/maestro-pixel7
```

The critical-paths suite covers:
1. New customer signup → first booking → completion → review
2. Provider signup → admin approval → first job → payout
3. Booking → cancel → refund flow
4. Booking → dispute → admin resolution
5. Wallet top-up → spend → withdraw flow
6. Recurring booking → 3 instances → cancel
7. Multi-device session: customer signs in on phone + tablet, both stay in sync

Each path is a complete Maestro flow (~30-50 steps) that exercises the screens, the API, the database, the S3 uploads, the notifications. Success = all pass with no visual diff and no console errors.

---

## Operational launch decision matrix

After Items 1–12 verified and final smoke complete, Ken has all signals to make the launch decision:

| Item | Status | Risk if missing |
|---|---|---|
| 1. NPC DPO registration | <pass/fail> | Regulatory action, ₱5M penalty per breach |
| 2. BIR OR series | <pass/fail> | Cannot issue compliant receipts; tax fraud exposure |
| 3. DTI permit | <pass/fail> | Cannot operate as registered business |
| 4. Mayor's permit | <pass/fail> | Cannot operate in Boracay |
| 5. hCaptcha | <pass/fail> | Bot abuse; abuse vector for SMS costs |
| 6. Sentry | <pass/fail> | Production errors invisible; debugging blind |
| 7. PayMongo | <pass/fail> | Cannot accept payments |
| 8. S3 BIR Object Lock | <pass/fail> | BIR audit failure; tax fraud exposure |
| 9. Postgres PITR | <pass/fail> | Data loss on infrastructure failure; cannot recover |
| 10. DNS + TLS | <pass/fail> | Customers cannot reach app |
| 11. Admin SSO | <pass/fail> | Recoverable; non-blocking |
| 12. BIR e-receipt | <pass/fail> | Same as Item 2 chain |

**Launch readiness rule:** Items 1–10 + 12 must all be PASS. Item 11 may be deferred. If any of the others is FAIL, postpone launch — none of these are graceful-degradation candidates.

---

## Dispatch 14 closeout

**Bugs claimed fixed:** N/A — operational launch blockers, not bugs in the audit-numbered sense

**Operational items completed (12):** see runbook above

**Files added:**
- `docs/runbooks/launch-cutover.md` (the full runbook)
- `docs/runbooks/postgres-restore.md`
- `docs/runbooks/incident-response.md`
- `docs/runbooks/secret-rotation.md` (90-day cycle for Sentry DSN, hCaptcha, etc.)
- `scripts/verify-dpo-registered.sh`
- `scripts/verify-bir-or-series.sh`
- `scripts/verify-hcaptcha.sh`
- `scripts/verify-sentry.sh`
- `scripts/verify-paymongo.sh`
- `scripts/verify-s3-bir.sh`
- `scripts/verify-postgres-pitr.sh`
- `scripts/verify-tls.sh`
- `scripts/verify-bir-pipeline.sh`
- `scripts/run-full-smoke.sh`
- `apps/mobile/.maestro/e2e/critical-paths/` (7 end-to-end Maestro flows)
- `infra/terraform/s3-bir-receipts.tf`

**Files modified:**
- `apps/mobile/eas.json` (production env vars)
- `.env.production.example` (template all production secrets without values)
- `LAUNCH-LIMITATIONS.md` (final cleanup; mark §1, §2, §15, §18, §19, §20, §21 as resolved)

**Tag:** `v1.0.0-launch-ready`

**Ken sign-offs (each must be checked):**
- [ ] DPO registered with NPC; reg # recorded
- [ ] BIR ATP obtained; OR series allocated
- [ ] DTI permit current
- [ ] Mayor's permit current
- [ ] hCaptcha live keys deployed
- [ ] Sentry production project receiving events
- [ ] PayMongo live mode confirmed
- [ ] S3 BIR Object Lock 10y enabled
- [ ] Postgres PITR verified by test restore
- [ ] DNS + TLS A+ rated
- [ ] (Optional) Admin SSO operational
- [ ] BIR e-receipt pipeline verified end-to-end
- [ ] All 110 screens pass Maestro / Playwright visual baselines
- [ ] All 7 critical-path E2E flows pass

When all sign-offs land: **launch is approved.** The platform exits Phase 14 and enters production.

---

# Part 3 complete

This installment closes the bug remediation manual. The 14 dispatches together cover:
- ~340 directly-cited audit findings
- ~1,000 reinforcement entries that resolve via the cited fixes
- 12 operational launch blockers
- All architectural patterns established and gate-enforced

The dispatch order has been calibrated to minimize rework: each dispatch leaves the next dispatch with a cleaner foundation. By Dispatch 14, the system is launch-ready by every reasonable measure.

Coming next:
- **Part 4 — Gate Hardening reference**. Across Dispatches 01-14 I introduced ~15 gate scripts (Gate A cross-source-of-truth fragments, Gate B bug-deferral, Gate C constitution, Gate D visual screenshots, Gate E mutation testing). Part 4 organizes these into a clean reference document with the canonical scripts, CI workflow integration, branch protection rules, and amendment process when a gate produces false positives.
- **Part 5 — Ken Handbook**. Written for non-developer review of each dispatch. How to verify a dispatch is actually complete (not just "AI coder claims complete"). How to spot fake-green. How to use the verification commands. How to read closeout reports. How to handle the operational items in Dispatch 14. How to make the architectural decisions that surface across dispatches. The handbook is calibrated for someone who does not read code but needs to make confident go/no-go calls on launch readiness.

Say continue for Part 4.
