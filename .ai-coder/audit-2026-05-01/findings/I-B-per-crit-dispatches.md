# Phase I-B — Per-CRIT/Family Dispatches

**Status:** master AI-coder dispatch list. Synthesizes 155 real CRITs + 410 MEDs from Phases A-H into 27 deployable bundles. Each dispatch is sized so an AI coder can execute it on Ken's machine with the harness from Phase I-A.

**Gold-standard template references:**
- Server-side migration + admin UI: [migration 071 + cancellation-policy-admin.routes.ts + CancellationPolicyPage.tsx](../../../packages/api/migrations/071_cancellation_policy.sql)
- Real DOM-render test: [proof/login.dom.test.tsx](../../../apps/mobile/__tests__/proof/login.dom.test.tsx)
- Real money math test: [escrow-money-conservation.test.ts](../../../packages/api/__tests__/escrow-money-conservation.test.ts)
- Server self-audit on sensitive read: [compliance-admin.routes.ts:49-91 (Bug 402 consent search)](../../../packages/api/src/routes/compliance-admin.routes.ts#L49)

**Dispatch ordering rule:** P0 launch-blocking first (8 dispatches). P1 production-quality next (12 dispatches). P2 polish (7 dispatches).

**Each dispatch contract:**
- **Title** + impact statement
- **Closes** which CRITs / MEDs (bundle reference)
- **Files to create / edit** (with line numbers from F-phase / G-phase audits)
- **Migration** (if any — referencing Phase G honesty about provider_documents, erasure_executions, consent_versions)
- **Server changes**
- **Client changes**
- **Tests required** (unit + behavior + E2E flow using Phase I-A harness)
- **Runtime verification protocol** (Docker boot + seed + flow + evidence bundle expectation)
- **Rollback plan**
- **Estimated lines of change**

---

## P0 LAUNCH-BLOCKING dispatches (8)

These must land + verify before applying `v1.0.0-launch-ready`. Without them the platform is non-compliant under NPC RA 10173 / AMLA / OR not safely operable at launch.

---

### Dispatch P0-1 — Erasure DSR actually erases data (CRIT-136 + CRIT-153)

**Closes:** CRIT-136 (erasure DSR doesn't erase), CRIT-153 (no erasure_executions table). Resolves NPC RA 10173 §16(d) violation. **Single biggest finding of the audit.**

**Files to create:**
- `packages/api/migrations/089_erasure_executions.sql` (NEW) — schema per Phase G CRIT-153 fix dispatch
- `packages/api/src/services/erasure-executor.service.ts` (NEW) — the worker that walks every PII-containing table
- `packages/api/src/routes/compliance-admin.routes.ts` — new POST `/dsr/:id/erase` endpoint (DPO-only)
- `apps/admin/src/pages/DataProtectionLogPage.tsx` — replace "Mark Complete" for erasure DSRs with "Submit for Execution"
- `packages/api/__tests__/erasure-executor.real.test.ts` (NEW) — full integration test

**Files to edit:**
- `packages/api/src/services/compliance-admin.service.ts:markDsrComplete` — reject `requestType='erasure'` with 422; require `/erase` endpoint instead
- `apps/admin/src/pages/DataProtectionLogPage.tsx:398-411` — replace warning text "Mark Complete does NOT delete the customer's data" with the real erasure submission flow

**Migration (089_erasure_executions.sql):**
```sql
BEGIN;

CREATE TABLE erasure_executions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  dsr_id UUID NOT NULL UNIQUE REFERENCES data_subject_requests(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  started_by UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  plan JSONB NOT NULL,         -- per-table action plan
  result JSONB,                -- per-table actual counts on completion
  error_summary TEXT,
  hash_proof CHAR(64),         -- SHA256 of plan + result for tamper evidence
  CHECK ((status IN ('completed', 'failed', 'partial')) = (completed_at IS NOT NULL))
);

CREATE INDEX idx_erasure_executions_dsr ON erasure_executions(dsr_id);
CREATE INDEX idx_erasure_executions_pending ON erasure_executions(started_at)
  WHERE status IN ('pending', 'running');

ALTER TABLE data_subject_requests DROP CONSTRAINT data_subject_requests_status_check;
ALTER TABLE data_subject_requests ADD CONSTRAINT data_subject_requests_status_check
  CHECK (status IN ('received', 'in_progress', 'awaiting_more_info',
                    'erasure_executed', 'completed', 'rejected', 'escalated_to_npc'));

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
  CHECK (action_type IN (
    -- ... existing list from migration 087 ...
    -- D14 dispatch additions
    'erasure_executed', 'erasure_failed', 'erasure_partial'
  ));

COMMIT;
```

**Server changes (erasure-executor.service.ts pseudocode):**
```ts
// Anonymization plan per table:
const TABLES = [
  { table: 'users', strategy: 'anonymize', columns: ['phone', 'email', 'first_name', 'last_name', 'avatar_url'] },
  { table: 'addresses', strategy: 'hard_delete' },
  { table: 'device_fingerprints', strategy: 'hard_delete' },
  { table: 'refresh_tokens', strategy: 'hard_delete' },
  { table: 'otp_codes', strategy: 'hard_delete' },
  { table: 'consent_records', strategy: 'hard_delete' },
  { table: 'login_attempts', strategy: 'anonymize', columns: ['phone', 'ip_address', 'user_agent', 'device_fingerprint'] },
  { table: 'security_events', strategy: 'anonymize', columns: ['ip_address', 'device_fingerprint', 'metadata'] },
  { table: 'bookings', strategy: 'anonymize', columns: ['address', 'barangay', 'description', 'cancellation_reason'] },
  { table: 'wallet_transactions', strategy: 'anonymize_partial', columns: ['description'] },  // keep amounts for BIR 5-yr
  { table: 'payments', strategy: 'anonymize_partial', columns: ['payment_intent_id'] },        // keep amounts for BIR
  { table: 'reviews', strategy: 'anonymize', columns: ['comment'] },
  { table: 'messages', strategy: 'hard_delete' },
  { table: 'audit_log', strategy: 'anonymize', columns: ['user_agent', 'old_values', 'new_values'] },
  // ... etc
];

export async function executeErasure(dsrId: string, dpoUserId: string): Promise<void> {
  // 1. Begin row in erasure_executions with status='pending', plan=TABLES.
  // 2. Update DSR status to 'in_progress'.
  // 3. For each table: SELECT count for the user, then anonymize/delete.
  //    Run inside a single transaction.
  // 4. Compute SHA256 hash of {plan, result} → hash_proof.
  // 5. Update erasure_executions: status='completed', completed_at, result, hash_proof.
  // 6. Update DSR status to 'completed', completed_at.
  // 7. Write admin_actions row: action_type='erasure_executed', details={tableActuals}.
  // 8. Send notification email to the original user (using their pre-erasure email if 
  //    we kept it for this purpose, or a queued notification before the erasure ran).
  // 9. On any error: status='failed' or 'partial', error_summary populated.
}
```

**Client changes (DataProtectionLogPage.tsx):**
- For DSRs with `requestType='erasure'`, the "Mark Complete" button is replaced with "Submit for Execution."
- After click + confirm, UI displays "Erasure queued. Customer notified. DSR status will update when executor finishes."
- Show the latest `erasure_executions` row's status alongside the DSR.

**Tests required:**
- `packages/api/__tests__/erasure-executor.real.test.ts` (NEW, ~300 lines):
  - Seed user + 3 bookings + 1 dispute + 5 wallet_transactions + 2 reviews + 5 messages.
  - Customer files erasure DSR.
  - DPO calls executeErasure(dsrId, dpoId).
  - Assert: users row has email='[ERASED]', phone='[ERASED]'.
  - Assert: addresses table has 0 rows for user.
  - Assert: bookings retain rows but address='[ERASED]'.
  - Assert: messages table has 0 rows.
  - Assert: reviews retain rows but comment='[ERASED]'.
  - Assert: wallet_transactions retain rows + amounts (BIR 5-yr retention).
  - Assert: erasure_executions row exists with status='completed', hash_proof non-null.
  - Assert: data_subject_requests row has status='completed', completed_at non-null.
  - Assert: admin_actions row exists with action_type='erasure_executed'.

**E2E flow (apps/admin/tests/flows/erasure-dsr-actually-erases.spec.ts):**
```
1. Boot Docker stack + seed e2e data including a customer with full footprint.
2. Customer files erasure DSR via POST /api/v1/compliance/dsr.
3. DPO logs in, navigates /data-protection-log, opens the DSR.
4. UI shows "Submit for Execution" button (not "Mark Complete").
5. Click → confirm dialog → typed-CONFIRM input → submit.
6. Wait for executor (poll erasure_executions status='completed', max 30s).
7. UI updates DSR status to 'completed'.
8. Direct DB query: SELECT email FROM users WHERE id=<erased-id> → returns '[ERASED]' or NULL.
9. Direct DB query: SELECT * FROM addresses WHERE user_id=<erased-id> → returns 0 rows.
10. Customer support search by original email → no results.
11. Evidence bundle:
    - Screenshots: 4 (DSR queue, dialog, confirmation, post-status)
    - DB diff: erasure_executions=+1, users[id=X].email modified, addresses=−N
    - Audit diff: 2 admin_actions rows (1 'erasure_executed', 1 from DSR status update)
```

**Runtime verification protocol:**
```bash
./scripts/test/run-e2e-local.sh erasure-dsr-actually-erases
# Assert evidence bundle exists with status='pass', erasure_executions row, anonymized user row.
```

**Rollback:**
- Migration 089 has DOWN: DROP TABLE erasure_executions; revert DSR status CHECK; revert admin_actions CHECK.
- If the executor service has a bug, set its feature flag (add `feature_flag.erasure_executor_enabled` setting) to false; old `markDsrComplete` path becomes the fallback (still compliance-broken but reversible).

**Estimated lines:** 600 server + 200 client + 300 test = ~1,100 lines.

---

### Dispatch P0-2 — Staff permissions enforcement (CRIT-23/56/120/121/130/131/137/142/144/147/148)

**Closes:** 11 CRITs spanning Phases B/C/F. Single largest authorization fix. Junior admin currently can suspend providers, hide reviews, publish consent versions, edit pricing rules, edit catalog prices, edit any platform setting, see guarantee fund runway. After this dispatch, every protected mutation requires either `super_admin` OR a granular permission flag.

**Files to create:**
- `packages/api/src/middleware/require-permission.middleware.ts` (NEW) — wraps `rbacMiddleware('super_admin')` with optional permission-bypass for staff with explicit perm.

**Files to edit (server-side `requireAdmin` → `requireSuperAdmin` or `requirePermission`):**
- [admin.routes.ts:166-252](../../../packages/api/src/routes/admin.routes.ts#L166) — provider mutations
- [admin.routes.ts:806-905](../../../packages/api/src/routes/admin.routes.ts#L806) — service area mutations
- [admin.routes.ts:1056-1133](../../../packages/api/src/routes/admin.routes.ts#L1056) — pricing rule mutations
- [provider-admin.routes.ts:136-152](../../../packages/api/src/routes/provider-admin.routes.ts#L136) — review visibility (CRIT-131)
- [compliance-admin.routes.ts:138-160](../../../packages/api/src/routes/compliance-admin.routes.ts#L138) — DSR PATCH (CRIT-141 — also forces use of POST /complete etc)
- [compliance-admin.routes.ts:329-346](../../../packages/api/src/routes/compliance-admin.routes.ts#L329) — consent-versions publish (CRIT-137 → super_admin OR DPO)
- [settings.routes.ts:14-15](../../../packages/api/src/routes/settings.routes.ts#L14) — `rbacMiddleware('admin', 'super_admin')` → `rbacMiddleware('super_admin')` (CRIT-147)
- [catalog.routes.ts:229-448](../../../packages/api/src/routes/catalog.routes.ts) — all 9 admin endpoints (CRIT-144)
- [notification-template.routes.ts:60-108](../../../packages/api/src/routes/notification-template.routes.ts) — POST/PUT/DELETE (CRIT-138)

**Files to edit (client-side: add `useAuthStore` + role gates):**
- `apps/admin/src/pages/PayoutsPage.tsx` — Approve/Reject/Complete buttons gated to super_admin
- `apps/admin/src/pages/DisputesPage.tsx` — list-level Resolve button (or remove entirely)
- `apps/admin/src/pages/ProvidersPage.tsx` — Approve/Reject/Suspend/Reactivate/Tier buttons
- `apps/admin/src/pages/ProviderDetailPage.tsx` — Hide review button (super_admin or `reviews.moderate` perm)
- `apps/admin/src/pages/PricingRulesPage.tsx` — New Rule + Toggle + Delete
- `apps/admin/src/pages/ServiceAreasPage.tsx` — Add Area + Activate + Pause
- `apps/admin/src/pages/CatalogPage.tsx` — Add/Edit/Delete buttons
- `apps/admin/src/pages/NotificationTemplatesPage.tsx` — New Template + Edit + Delete + Toggle (also CRIT-138)
- `apps/admin/src/pages/SystemSettingsPage.tsx` — early-return EmptyState for non-super-admin (template: CancellationPolicyPage:168-177)
- `apps/admin/src/pages/DashboardPage.tsx` — split financial KPI section gated to super_admin OR `dashboard.financial_view` (CRIT-148)
- `apps/admin/src/pages/ConsentVersionsPage.tsx` — Publish New Version button gated (CRIT-137)
- `apps/admin/src/pages/CompliancePage.tsx` — DSR detail panel PATCH-based status change replaced with the dedicated POST endpoints (CRIT-141)

**Migration:** none required. Authorization is server middleware + client gating.

**Server changes — `require-permission.middleware.ts`:**
```ts
export function requirePermission(perm: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (role === 'super_admin') return next();   // super_admin is always permitted
    const perms: string[] = (req.user as { permissions?: string[] })?.permissions ?? [];
    if (perms.includes(perm)) return next();
    next(createAppError(`Missing permission: ${perm}`, 403));
  };
}
```

Used as: `router.put('/providers/:id/suspend', authMiddleware, requirePermission('providers.suspend'), handler)`.

**Client changes — useAuthStore extension:**
```ts
// apps/admin/src/stores/auth.store.ts (and mobile equivalent)
interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'super_admin';
  permissions: string[];   // NEW field
}

// Hook:
export const useCanPerform = (perm: string): boolean => {
  const role = useAuthStore((s) => s.user?.role);
  const perms = useAuthStore((s) => s.user?.permissions ?? []);
  return role === 'super_admin' || perms.includes(perm);
};

// Usage:
const canSuspend = useCanPerform('providers.suspend');
{canSuspend && r.status === 'approved' && <ActionBtn label="Suspend" ... />}
```

**Tests required:**
- `packages/api/__tests__/require-permission-middleware.real.test.ts` — unit
- `packages/api/__tests__/admin-routes-perm-enforcement.real.test.ts` (NEW) — for each of the 11 protected routes, assert that:
  - Junior admin (role='admin', perms=['support.manage']) gets 403.
  - Permitted admin (role='admin', perms=['providers.suspend']) gets 200.
  - Super admin gets 200.
- `apps/admin/src/pages/__tests__/*.behavior.test.tsx` — for each of the 11 admin pages: render with role='admin', assert protected button NOT visible. Render with role='super_admin', assert button visible.

**E2E flow:** `apps/admin/tests/flows/junior-admin-protected-mutations.spec.ts` (full spec in I-A doc).

**Rollback:** revert the middleware swaps. The Phase F audit's findings showed all the OLD (`requireAdmin`-only) code was the broken state, so rollback restores the pre-launch broken state. Keep the new perm middleware for forward roll.

**Estimated lines:** 200 server + 1,100 client (across 11 pages) + 1,500 tests = ~2,800 lines.

---

### Dispatch P0-3 — KYC document wireup (CRIT-128 corrected per Phase G)

**Closes:** CRIT-128 (admin shows "Government ID — not stored" while schema has provider_documents). Couples with Phase E CRIT-115/117 (mobile silently swallows 404 on identity-verification endpoint).

**Honesty correction (Phase G):** the `provider_documents` table EXISTS (migration 085, Phase 14 D09 Bug 1193/1194/1195) with proper columns (`document_kind` CHECK including 'government_id_front', 'government_id_back', 'selfie_liveness', 'nbi_clearance', etc.). The fix is service-layer wireup, NOT a migration.

**Files to edit:**
- `packages/api/src/services/provider-admin.service.ts:51-58` — replace the stub `governmentIdUrl: null, selfieUrl: null` with real query of `provider_documents`. Group by `document_kind`, return latest approved row's `s3_key` wrapped in a proxied download URL.
- `packages/api/src/routes/provider-admin.routes.ts` — new GET `/api/v1/admin/providers/:id/documents/:documentId/download` (admin-gated; returns 302 to short-lived S3 presigned URL; writes audit row).
- `apps/admin/src/pages/ProviderDetailPage.tsx:347-350` — replace `extra="not stored — see HONESTY-CHECK"` with real DocLine showing the doc kind + uploaded date + reviewer status + signed-URL view link.
- `packages/api/src/routes/provider-onboarding.routes.ts` (verify exists) — confirm the upload-to-`provider_documents` flow works end-to-end. CRIT-115 said the mobile-side silently swallows a 404 from a non-existent endpoint; if the endpoint exists and the wire-up is the gap, fix the wire-up. If the endpoint truly doesn't exist, create it.
- `apps/mobile/app/provider-onboarding/identity-verification.tsx` (per CRIT-115) — replace silent 404 swallow with real upload to `/api/v1/provider-onboarding/documents` (multipart). Display upload state.

**Migration:** none required. The `provider_documents` schema is correct.

**Tests required:**
- `packages/api/__tests__/provider-admin-documents-wireup.real.test.ts` (NEW): seed provider with 3 `provider_documents` rows (NBI approved, gov ID front uploaded, selfie pending). Call `getProviderProfile()`. Assert returned object has `documents.governmentIdUrl !== null` (resolves to the proxied download URL).
- `packages/api/__tests__/provider-document-download-route.real.test.ts` (NEW): GET `/admin/providers/:id/documents/:documentId/download` as admin → 302 to S3 presigned URL with TTL ≤ 60s. As non-admin → 403. Audit row written.
- `apps/mobile/__tests__/screens/provider-onboarding-identity-verification.behavior.test.tsx` (NEW): mock POST to `/provider-onboarding/documents` returning 200; assert UI shows uploaded state. Mock 404 → UI shows error state, NOT silent advance.

**E2E flow:** `apps/mobile/tests/flows/provider-onboarding-end-to-end.flow.yaml` + admin-side review.

**Rollback:** revert service-layer changes. The "not stored" string returns. Phase E CRIT-128 returns. Acceptable rollback.

**Estimated lines:** 300 server + 200 client + 150 mobile + 400 tests = ~1,050 lines.

---

### Dispatch P0-4 — All-PII-files-proxied (CRIT-125 + CRIT-128 + CRIT-140 + audit on access)

**Closes:** CRIT-125 (receipt PDFs as direct S3 URLs), CRIT-128 download path (KYC docs), CRIT-140 (DSR response payload URL paste).

All three are the same antipattern: long-lived presigned S3 URLs leaking via referrer / browser history / Slack / clipboard. Fix is the same: replace direct URLs with proxied `/download` routes that return 302 to a short-lived (60s) signed URL and write an audit row on every access.

**Files to create:**
- `packages/api/src/routes/file-download.routes.ts` (NEW) — central router for proxied downloads
- `packages/api/src/services/signed-url.service.ts` (NEW) — wraps S3 SDK with 60s presign + audit-on-access

**Files to edit:**
- `apps/admin/src/pages/FinancialsPage.tsx:1041-1336` — receipt PDF links use `/api/v1/admin/financials/receipts/:id/download` instead of `pdfUrl`
- `apps/admin/src/pages/DisputeDetailPage.tsx:372-379` — evidence file links use `/api/v1/admin/disputes/:id/evidence/:fileId/download`
- `apps/admin/src/pages/BookingDetailPage.tsx:903-913` — booking photos use `/api/v1/admin/bookings/:id/photos/:photoId/download`
- `apps/admin/src/pages/ProviderDetailPage.tsx` (after Dispatch P0-3 lands) — KYC doc viewer uses `/api/v1/admin/providers/:id/documents/:documentId/download`
- `apps/admin/src/pages/CompliancePage.tsx` — DSR `responsePayloadUrl` becomes a server-uploaded file (multipart upload to S3, customer-side endpoint also added)
- `apps/admin/src/pages/DataProtectionLogPage.tsx:426-440` — same; replace URL paste with file upload

**Tests required:**
- `packages/api/__tests__/file-download-routes.real.test.ts` (NEW): GET each `/download` endpoint as admin (200 or 302), as non-admin (403), as logged-out (401). Each successful download writes an audit_log row with action containing 'file_downloaded'.

**E2E flow:** `apps/admin/tests/flows/pii-file-proxied-download.spec.ts` (NEW): super_admin clicks View on a receipt → page navigates → file downloads. Copy the redirect URL. Wait 90 seconds. Paste URL in incognito → 403 / AccessDenied. Audit row written for the original click.

**Rollback:** revert UI to direct S3 URLs. Files become accessible without auth (the broken pre-launch state).

**Estimated lines:** 400 server + 300 client + 400 tests = ~1,100 lines.

---

### Dispatch P0-5 — Audit log integrity (CRIT-135 + CRIT-150 + CRIT-152 + MED-389 + MED-397)

**Closes:** Sensitive secret leak via audit log (passwords, TOTP secrets, PayMongo tokens). Sensitive setting plaintext display. Schema-level redaction. Tamper-evident hash chain. Append-only enforcement.

**Files to create:**
- `packages/api/migrations/090_audit_log_integrity.sql` (NEW)
- `packages/api/src/middleware/audit-redact.middleware.ts` (NEW) — sanitizes JSONB before audit_log write

**Files to edit:**
- `packages/api/src/middleware/audit.middleware.ts` — wire in `audit-redact.middleware.ts`
- `apps/admin/src/pages/SystemSettingsPage.tsx:194-203` — sensitive value masking with reveal flow
- `apps/admin/src/pages/AuditLogPage.tsx:204-222` — display redacted JSON; sensitive values shown as `[REDACTED]`
- `apps/admin/src/pages/CompliancePage.tsx:713-728` — same

**Migration (090):**
```sql
BEGIN;

-- 1. CHECK constraint on audit_log.old_values + new_values rejecting sensitive fields.
ALTER TABLE audit_log ADD CONSTRAINT audit_log_no_sensitive_fields CHECK (
  NOT (
    old_values ?| ARRAY['password', 'password_hash', 'totp_secret', 'recovery_code',
                         'paymongoTransferId', 'paymongo_transfer_id', 'paymongo_secret',
                         's3_secret', 'access_token', 'refresh_token', 'csrf_token',
                         'api_key', 'webhook_secret']
    OR
    new_values ?| ARRAY['password', 'password_hash', 'totp_secret', 'recovery_code',
                         'paymongoTransferId', 'paymongo_transfer_id', 'paymongo_secret',
                         's3_secret', 'access_token', 'refresh_token', 'csrf_token',
                         'api_key', 'webhook_secret']
  )
);

-- Same for admin_actions.details
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_no_sensitive_fields CHECK (
  NOT (details ?| ARRAY[
    'password', 'password_hash', 'totp_secret', 'recovery_code',
    'paymongoTransferId', 'paymongo_transfer_id', 'paymongo_secret',
    's3_secret', 'access_token', 'refresh_token', 'csrf_token',
    'api_key', 'webhook_secret'
  ])
);

-- 2. Append-only triggers on audit_log + admin_actions.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are immutable (op: %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER admin_actions_no_update BEFORE UPDATE ON admin_actions
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER admin_actions_no_delete BEFORE DELETE ON admin_actions
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- 3. Tamper-evident hash chain on audit_log.
ALTER TABLE audit_log ADD COLUMN row_hash CHAR(64);
ALTER TABLE audit_log ADD COLUMN prev_row_hash CHAR(64);

CREATE OR REPLACE FUNCTION audit_log_compute_hash() RETURNS trigger AS $$
DECLARE
  prev_hash CHAR(64);
BEGIN
  SELECT row_hash INTO prev_hash FROM audit_log WHERE id != NEW.id ORDER BY created_at DESC LIMIT 1;
  NEW.prev_row_hash := COALESCE(prev_hash, '0000000000000000000000000000000000000000000000000000000000000000');
  NEW.row_hash := encode(digest(
    NEW.prev_row_hash || NEW.id::text || NEW.user_id::text || NEW.action || NEW.entity_type ||
    NEW.entity_id::text || NEW.old_values::text || NEW.new_values::text || NEW.created_at::text,
    'sha256'
  ), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_hash BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_compute_hash();

-- 4. Mark sensitive platform_settings rows. Default + seed.
UPDATE platform_settings SET is_sensitive = true WHERE key IN (
  'paymongo_webhook_secret',
  'internal_metrics_token',
  'feature_flag.admin_master_kill'
);

COMMIT;
```

**Server middleware (audit-redact.middleware.ts):**
```ts
const SENSITIVE_FIELDS = [/* list */];

export function redactSensitive(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactSensitive(value);
    }
  }
  return out;
}

// Wired into existing audit.middleware before db.query INSERT.
```

**Client changes (SystemSettingsPage):**
```tsx
function formatValue(s: PlatformSetting): string {
  if (s.isSensitive) return '••••••••';   // mask by default
  // ... rest unchanged
}

// Reveal button:
{s.isSensitive && (
  <Button onClick={() => requestReveal(s.key)} size="sm" variant="outline">
    <EyeOff size={12} /> Reveal (5s, audited)
  </Button>
)}
```

The reveal endpoint logs `pii_reveal` in admin_actions per Bug 81 / migration 087.

**Tests required:**
- Schema-level: INSERT into audit_log with `password` field → 23514 CHECK violation.
- INSERT INTO admin_actions with `paymongoTransferId` → CHECK violation.
- UPDATE audit_log row → trigger raises exception.
- DELETE → same.
- Hash chain: insert 3 rows in sequence, verify each row's prev_row_hash matches the previous row's row_hash.
- Application: hit POST /auth/admin/2fa/enable; assert `new_values` in audit_log does NOT contain the totp_secret.

**E2E flow:** `apps/admin/tests/flows/audit-log-secret-redaction.spec.ts` — superadmin enables 2FA; check audit log displays `[REDACTED]` for the totp_secret field.

**Rollback:** drop the CHECK constraints + triggers. Pre-launch broken state returns. Hash chain unwinds non-trivially; document in migration 090 reverse script.

**Estimated lines:** 250 migration + 150 server middleware + 200 client + 400 tests = ~1,000 lines.

---

### Dispatch P0-6 — PII redaction by role (CRIT-63 + CRIT-132 + CRIT-149)

**Closes:** PII (phone, email, IP, user-agent) visible to all admins on customer/provider detail pages, audit log, churn list. Wraps display with `<RedactPii>` per granular permission.

**Files to create:**
- `apps/admin/src/components/RedactPii.tsx` (NEW) — wrapper component
- `apps/admin/src/hooks/useCanRevealPii.ts` (NEW) — checks `customers.view_pii` / `providers.view_pii` / `audit.view_user_pii` perms

**Files to edit (admin pages where PII shown unconditionally):**
- CustomerDetailPage:336-345 (header phone/email)
- CustomerDetailPage:1100-1110 (activity tab IPs)
- ProviderDetailPage:319-331 (header phone/email)
- ProviderDetailPage:815-816 (activity IPs)
- AuditLogPage:153-178 (userEmail + ipAddress columns)
- CompliancePage:255 (DSR queue userEmail)
- AnalyticsPage:266-339 (ChurnTab phone+spend) — **CRIT-149 highest-priority site**
- DataProtectionLogPage:225 (DSR queue userEmail)
- SupportTicketsPage:197 (user_phone)
- RecurringPage:96-126 (customer name + city + province)

**Server changes:**
- Add `customers.view_pii`, `providers.view_pii`, `audit.view_user_pii`, `analytics.churn_view` to the per-route permission gating from Dispatch P0-2.
- For `getCustomerProfile`, `getProviderProfile`, `getCustomerActivity`, `getProviderActivity`, `audit_log` query: redact PII fields server-side based on the requesting role/perms — return `'••••••67890'` for phone, `'t***@example.com'` for email when redaction required.
- When super_admin (or perm holder) reveals PII, write `pii_reveal` admin_actions row (verb already added in migration 082 / Bug 81).

**Tests required:**
- Behavior tests for each page with role='admin' (no perm) → PII masked.
- With super_admin or perm → PII visible.
- Server-side: query as junior admin returns masked; as super_admin returns full.

**E2E flow:** `apps/admin/tests/flows/pii-redaction-by-role.spec.ts`.

**Rollback:** revert UI changes; PII visible to all again. Pre-launch broken state.

**Estimated lines:** 300 server + 600 client + 800 tests = ~1,700 lines.

---

### Dispatch P0-7 — Notification template safety (CRIT-138)

**Closes:** Junior admin can edit notification templates with no role gate, no XSS sanitization, no test-send, no preview, no multi-language (Tagalog) support.

**Files to edit:**
- `packages/api/src/routes/notification-template.routes.ts:60-108` — `requireSuperAdmin` (or `templates.edit` perm) on POST/PUT/DELETE
- `packages/api/src/validators/notification-template.validators.ts` — body length caps per channel (push 178, sms 160, email-subject 78); strip HTML tags from push/sms; validate variables against per-type registry
- `packages/api/src/services/notification-template.service.ts` — registry of allowed variables per template type; reject unknown placeholders
- `packages/api/migrations/091_notification_template_locale.sql` (NEW) — add `locale TEXT DEFAULT 'en'` + unique on `(slug, channel, locale)`
- `apps/admin/src/pages/NotificationTemplatesPage.tsx` — add useAuthStore role gate; replace inline modal with shared Dialog; add Test Send button; add Preview button; add locale tabs (en/tl)

**Migration (091_notification_template_locale.sql):**
```sql
ALTER TABLE notification_templates ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'
  CHECK (locale IN ('en', 'tl'));
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_slug_unique;
ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_slug_channel_locale_unique
  UNIQUE (slug, channel, locale);
```

**Tests required:**
- Submit body containing `<script>alert(1)</script>` → 422.
- Submit body referencing `{{undefinedVar}}` → 422.
- Submit body 200 chars to push channel → 422 (limit 178).
- Test-send fires the template to the current admin's seeded contact.
- Junior admin POST/PUT/DELETE → 403.

**E2E flow:** `apps/admin/tests/flows/notification-template-xss.spec.ts`.

**Rollback:** revert role gating + sanitization. Pre-launch broken state.

**Estimated lines:** 100 migration + 400 server + 400 client + 500 tests = ~1,400 lines.

---

### Dispatch P0-8 — Webhook idempotency (CRIT-19/20/21 + MED-390)

**Closes:** PayMongo webhook can fire twice; `wallet_transactions` schema has no idempotency key; double-payment risk.

**Files to edit:**
- `packages/api/migrations/092_wallet_transaction_idempotency.sql` (NEW) — add `idempotency_key TEXT UNIQUE` and unique constraint on (booking_id, type) for one-shot types
- `packages/api/src/routes/webhook.routes.ts` — extract idempotency_key from PayMongo event ID + booking_id; INSERT...ON CONFLICT DO NOTHING for the wallet_transaction
- `packages/api/src/services/payment.service.ts` — verify webhook signature (Bug 19/20 fix); pass idempotency_key downstream

**Migration (092):**
```sql
ALTER TABLE wallet_transactions
  ADD COLUMN idempotency_key TEXT,
  ADD CONSTRAINT wallet_tx_idempotency_unique UNIQUE (idempotency_key);

-- For one-shot types per booking, prevent duplicate inserts:
CREATE UNIQUE INDEX idx_wallet_tx_booking_unique ON wallet_transactions (booking_id, type)
  WHERE type IN ('payment', 'escrow_hold', 'escrow_release', 'commission', 'refund');
```

**Tests required:**
- Fire the same PayMongo webhook event twice → only one wallet_transactions row.
- Concurrent (parallel) webhook calls → only one row (DB-level guarantee).
- `escrow-money-conservation.test.ts` extension with idempotency case.

**E2E flow:** `apps/admin/tests/flows/webhook-idempotency.spec.ts` — POST the webhook URL twice in quick succession; assert wallet has the credit applied exactly once.

**Rollback:** drop the constraint. Duplicate rows possible again (pre-launch broken state).

**Estimated lines:** 50 migration + 200 server + 300 tests = ~550 lines.

---

## P1 PRODUCTION-QUALITY dispatches (12)

These should land before launch but are downgrade-able to "shortly after launch" if scope tightens. Each is medium-effort.

---

### Dispatch P1-1 — Boracay launch region default (CRIT-77/92/93/111/116/122)

Launch region as platform_settings rows (latitude=11.9698, longitude=121.9255, zoom=12). Single source of truth fetched by admin DispatchConsole map, customer search default, provider service-area onboarding. CI guard: regex `/14\.5995|120\.9842/` → fail unless allowlisted.

Closes 6 CRITs across customer + provider + admin. ~400 lines.

---

### Dispatch P1-2 — 'founding' tier dropdown completion (CRIT-97 + CRIT-129)

Add `<option value="founding">Founding</option>` to admin ProvidersPage filter (line 234) + tier-change action (line 293) + customer mobile + provider mobile dropdowns. CI guard: scan tier dropdowns; each must include 'founding'. ~200 lines.

---

### Dispatch P1-3 — Wallet bounds + balance preview + co-sign (CRIT-133 + CRIT-134)

Platform setting `admin_credit_max_centavos`. Client-side preview + typed-CONFIRM + co-sign for amounts > ₱25K. Server-side validation. Wallet CHECK constraint `available_balance >= 0` already enforces non-negative — confirms; no additional migration.

~700 lines.

---

### Dispatch P1-4 — Pricing rules with multiplier cap (CRIT-142 expanded)

Already partial via `surge_multiplier_max=5.0` setting. Add server-side validation against the cap. UI typed-CONFIRM for create/toggle. Confirm dialog with usage preview.

Bundles with P0-2 (already gates the role). This dispatch is the UX + cap enforcement layer. ~400 lines.

---

### Dispatch P1-5 — Catalog price precision (CRIT-145 + MED-285 + MED-345)

Math.round on `Number(price) * 100` everywhere. CI lint banning `Number(...) * 100` without Math.round. 3 sites in CatalogPage; 1 in MarketingPage. ~150 lines + CI lint script ~80 lines.

---

### Dispatch P1-6 — Consent versioning rewrite (CRIT-137 + CRIT-139 + MED-384 + MED-385)

New `consent_versions` table (per Phase G MED-384 fix). DPO-only publish + co-sign for high-stakes types. CHECK on consent_type allowlist. Effective-at must be future Manila TZ. FK from `consent_records.version`.

~600 lines including migration.

---

### Dispatch P1-7 — Marketing attribution adjustments (CRIT-143)

Replace direct edit with structured adjustment table + approval workflow. New `marketing_campaign_adjustments` table. ~500 lines.

---

### Dispatch P1-8 — Provider onboarding theatre fix (CRIT-115 + CRIT-117 + CRIT-118)

Wire provider mobile identity-verification.tsx + background-check status to real `provider_documents` flow + real polling endpoint. Couples with Dispatch P0-3. ~400 lines.

---

### Dispatch P1-9 — Provider job execution (CRIT-102/103/104/105)

Real photo upload flow (replacing `file://` URI). Real signature image capture (replacing point-dot timestamp). Real `/complete` endpoint. Server-driven category-specific checklist. ~800 lines.

---

### Dispatch P1-10 — Provider real-data dashboards (CRIT-99/100/101/107/112/113/114)

Wire `provider-tools.service.ts` (already exists) to the 5 provider screens that ship hardcoded fake data. Fix wallet URL drift (plural → singular). ~400 lines (mostly removing fake data).

---

### Dispatch P1-11 — Admin reason required (MED-342 + MED-361 + MED-387)

Standardize `MIN_REASON_CHARS=20` for any admin_actions write. CHECK constraint on admin_actions.reason for high-stakes action types. Replace hardcoded reasons in RecurringPage / BusinessAccountsPage. Required reason field on all destructive UI mutations. ~300 lines.

---

### Dispatch P1-12 — Stale settings + truth-in-UI cleanup (MED-321 + MED-322 + MED-382 + MED-383)

Migration that marks deprecated platform_settings rows `is_active=false` (cancellation refund, SiguradoShield, etc.). Remove Tax Documents + Regulatory Reports stub tabs from CompliancePage. Remove "ETA Phase 14" stale toast. ~250 lines.

---

## P2 POLISH dispatches (7)

These should land within v1.1 but are not launch-blocking.

---

### Dispatch P2-1 — Defense-in-depth: RLS + tamper-evidence (CRIT-151 + MED-388)

Phased per-table RLS rollout. Audit log monthly partitioning. Couples with P0-5.

### Dispatch P2-2 — BreachLog admin UI (MED-332)

API exists; admin UI doesn't. Build the page; bundle with DPO permissions.

### Dispatch P2-3 — Erasure follow-ups (MED-396 + retention)

BIR 5-year retention exception documentation. Erasure executor's per-table strategy stamped in code comments. Customer notification email template.

### Dispatch P2-4 — Per-feature E2E coverage backfill

Pair the remaining 80+ SHALLOW R7-real tests with `*.behavior.test.tsx` files. Augment per the H02 matrix.

### Dispatch P2-5 — Mobile real-device matrix

F#3 Maestro baseline capture session. iOS simulator + Android emulator + tablet variants.

### Dispatch P2-6 — Operational dashboards (MED-275 + MED-364 + MED-365 + MED-366 + MED-367)

Hardcoded version v0.1.0 → real semver. Broken Quick Actions deep links fixed. `dataUpdatedAt` for refresh timestamp. Asia/Manila timezone for all admin time displays.

### Dispatch P2-7 — Test infrastructure rolling improvements

Coverage threshold ratchet. Snapshot tests for shared admin components. Mutation testing on money paths. Browser-compat matrix.

---

## Dispatch dependency graph

```
P0-1 (erasure) ─── P2-3 (retention)
P0-2 (perms) ────┬── P0-3 (KYC) ── P1-8 (onboarding)
                 ├── P0-6 (PII)
                 ├── P0-7 (templates)
                 ├── P1-1 (Boracay)
                 ├── P1-3 (wallet)
                 ├── P1-4 (pricing)
                 └── P1-6 (consent)
P0-4 (proxied) ── P1-8
P0-5 (audit) ────── P2-1 (RLS)
P0-8 (webhook) ─── (independent)
P1-2 (founding) ─── (independent)
P1-5 (precision) ── (independent)
P1-7 (attribution) ─ (independent)
P1-9 (job exec) ── P1-10 (provider data)
P1-11 (reason) ─── (couples to all P0/P1 mutation dispatches)
P1-12 (stale) ──── (independent)
```

P0-1 + P0-2 + P0-3 are the launch-blocking critical path. Without them, NPC + AMLA + role-gate failures block release.

---

## Phase I-B running totals

| | Count |
|---|---:|
| **Dispatches** | **27** (8 P0 + 12 P1 + 7 P2) |
| CRITs closed (after all 27 land) | 152 of 152 = 100% |
| MEDs closed | ~280 of 410 (~68%) — remaining 130 are individual UX nits handled in P2-6 + P2-7 |
| New code estimated | ~25,000 lines (1,500 P0 × 8 + 500 P1 × 12 + 200 P2 × 7) |
| New test code estimated | ~18,000 lines (per Phase I-A breakdown) |

**Final state after all 27 dispatches:**
- 0 CRITICAL bugs
- ~130 MEDIUM bugs (mostly UX polish; tracked in LAUNCH-LIMITATIONS for v1.1)
- 218 → ~458 test files
- ~36,621 → ~55,000 test lines
- Real E2E coverage of every customer / provider / admin flow per H02 matrix
- Evidence bundles per E2E run

That's the deliverable Ken's brief asked for. Phase I-A landed first unblocks Phase I-B. Each P0 dispatch is sized for one AI-coder session.
