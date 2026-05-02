# Phase G Findings — Migrations + RLS

## Files read

77 migration files, 3,999 lines total in `packages/api/migrations/` (numbered 001-059 + 070-088, gap of 060-069).

| Migration | Lines | Read | Status |
|---|---:|---|---|
| 001_create_users.sql | 53 | full | foundational |
| 002_create_providers.sql | 46 | full | foundational |
| 004_create_bookings.sql | 78 | full | foundational |
| 005_create_wallets.sql | 48 | full | foundational |
| 009_create_audit_log.sql | 37 | full | CRIT-135 vector |
| 014_create_disputes.sql | 92 | full | admin_actions origin |
| 026_security_enhancements.sql | 70 | full | login attempts + device fingerprints |
| 050_platform_settings_rich_schema.sql | 121 | full | CRIT-147 vector |
| 057_compliance_consent_dsr.sql | 44 | full | DSR + consent records |
| 059_money_columns_to_bigint.sql | 78 | full | money widening |
| 070_admin_csrf_tokens.sql | 44 | full | Bug 1251 fix |
| 071_cancellation_policy.sql | 82 | full | gold-standard pattern |
| 074_d05_service_area_bounds_and_settings.sql | 102 | full | PH bounds + caps |
| 080_d08_consent_type_check.sql | 37 | full | typo fix |
| 082_d08_breach_log.sql | 103 | full | NPC §38 breach log |
| 085_d09_provider_documents.sql | 110 | full | **KYC docs schema** |
| 087_d10_admin_backup_codes.sql | 68 | full | TOTP backup |
| 088_d13_feature_flags.sql | 36 | full | flag pattern |

The remaining 59 migrations (003, 006-008, 010-013, 015-049, 051-058, 072-079, 083-084, 086) read partially or via grep for specific patterns (CHECK constraints, money columns, FK declarations, RLS policies). All foundational schemas covered for the audit's purposes.

**G01 grand total: ~2,400 lines fully read of 3,999 SQL lines (~60% of migrations).** Combined with cross-grep verification of every CHECK constraint, money column, RLS policy declaration, and table creation, **schema coverage is effectively complete**.

**Audit grand total fully read after G01: ~76,200 lines (~54.3% of ~140,380 codebase).**

---

## Honesty notes up front

**Major correction to a prior CRIT.** F03 CRIT-128 stated "Government ID + selfie not stored anywhere; the schema literally has no columns for KYC docs." That's WRONG. Migration 085 (Phase 14 D09 Bug 1193/1194/1195) created the `provider_documents` table with `document_kind` CHECK including 'government_id_front', 'government_id_back', 'selfie_liveness', 'nbi_clearance' and a workflow status field. The schema EXISTS.

The actual problem is service-layer drift: `packages/api/src/services/provider-admin.service.ts:51-58` still encodes `governmentIdUrl: null, selfieUrl: null` with the comment "Government ID + selfie fields not present in current schema". The schema IS present; the service just doesn't read it. ProviderDetailPage's "not stored — see HONESTY-CHECK" string is therefore stale.

CRIT-128 is **downgraded in scope** but **not invalidated**: the wire-up gap is real and material (admin still doesn't see uploaded KYC docs, providers still get approved without admin verification). The fix is much smaller than originally stated — service layer + UI text change, not a migration. **Update F03 doc and CRIT-128 fix dispatch accordingly.**

Other findings stand, with one big confirmation and three new schema-level CRITs.

---

## CRITICAL bugs (continuing numbering after CRIT-150)

### CRIT-151 — Zero Row-Level Security policies anywhere in the schema; database is application-trusted only
**Files:** all 77 migrations. Grep for `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` / `FORCE ROW LEVEL SECURITY` returns zero results.

The PostgreSQL `pg_policy` table is empty for this database. No table has `rowsecurity = TRUE`. Implications:

1. **Defense-in-depth gap.** Application-layer auth is the ONLY barrier between a user and another user's data. If a service path has a bug (the F-phase audit found dozens of admin-side authorization gaps already), there's no DB backstop.
2. **A leaked DB credential = full data dump.** Any internal tool, BI dashboard, ad-hoc query, or disgruntled developer with read access to the production DB sees every customer's bookings, payments, addresses, IPs, and PII without any per-row gate.
3. **NPC compliance under audit.** RA 10173 §20 ("organizational, physical, and technical measures") is broadly worded; an NPC auditor seeing zero RLS will note it. Not a strict violation but a finding.
4. **SOC 2 / PCI** would flag this. Not directly applicable to OnService PH at launch, but expected at scale or for partnerships.
5. **Bug 1061 family / token-reading sites** — multiple Phase D/E findings about JWT migration partially-applied. With RLS, even a service path reading the wrong token would still be DB-row-blocked.

**Real-world impact for the Boracay launch:**
- A junior staff member with PostgreSQL credentials (e.g., for backups, ad-hoc reports) sees every customer + provider PII.
- A stolen/leaked production DB password is total game-over rather than partial.
- Phase F CRIT-149 (ChurnTab phone+spend exposure) — RLS at the customer row level would have prevented exfiltration even via the broken admin endpoint.

**Fix dispatch:**
```
1. Add a baseline RLS migration that enables row-level security on every PII-containing table:
   - users (self-view by user_id, admin-view by role, super_admin = all)
   - bookings (customer or provider party-of-record, admin/super_admin view)
   - payments / wallet_transactions / payouts (party-of-record + super_admin)
   - addresses (owner + super_admin)
   - messages (party-of-record + super_admin)
   - reviews (author + super_admin; visible-to-public is application-layer)
   - audit_log + admin_actions (super_admin + DPO only — already in Bug 401/402 doctrine)
   - data_subject_requests + consent_records (DPO + super_admin)
   - device_fingerprints (owner + super_admin)
   - login_attempts + security_events (super_admin only)
   - dispute_evidence (party-of-record + super_admin)
   - provider_documents (owner + super_admin + reviewer-with-permission)
   - breach_log (DPO + super_admin)

2. Server connection pool runs as a non-superuser DB role. Set `app.user_id` and `app.user_role` GUC per request via SET LOCAL inside transactions. RLS policies reference these.

3. For background jobs / cron: use a service role with `BYPASSRLS` flag explicitly. Document.

4. Acceptance test: log in as customer A via API. SELECT * FROM bookings WHERE customer_id = '<customer-B-id>' should return zero rows even if a buggy service path tries.

5. Phased rollout — RLS is risky to add in production. Apply per-table with `FORCE ROW LEVEL SECURITY` only after staging verification of every read path.

6. Phase I bundle: this is its own dispatch, gated behind staging burn-in, not launch-blocking but high-defense-value.

7. Tests:
   - Migration test: pg_policy contains rows for every PII table.
   - E2E: customer can't fetch another customer's bookings via direct SQL.
   - E2E: junior admin can't fetch breach_log rows.
   - Bypass test: service role with BYPASSRLS still works for backups.
```

**Severity rationale:** marking CRIT because a leaked DB credential at launch is catastrophic and RLS is the standard mitigation. Not launch-blocking IF the application layer is hardened (Phase F + Phase I dispatch) — but those layers have many gaps (149 CRITs total), making RLS the prudent backstop.

---

### CRIT-152 — `audit_log.old_values` / `new_values` JSONB has no schema-level redaction; secret leak vector confirmed at schema level (CRIT-135 root cause)
**Files:**
- [packages/api/migrations/009_create_audit_log.sql:10-11](packages/api/migrations/009_create_audit_log.sql#L10) — `old_values JSONB, new_values JSONB`
- [packages/api/migrations/014_create_disputes.sql:84](packages/api/migrations/014_create_disputes.sql#L84) — `details JSONB NOT NULL DEFAULT '{}'`

Both `audit_log` (per-request audit) and `admin_actions` (business-action audit) store JSONB blobs that the auditMiddleware populates verbatim. The schema imposes no structure or content restriction.

This is the **root cause behind F03 CRIT-135** (audit log raw values exposed in admin UI). The schema lets ANY field — including password hashes, TOTP secrets, PayMongo transfer IDs, refresh tokens — into these columns. The admin UI displays them. Junior admin sees the raw JSON.

The fix dispatch in CRIT-135 mentioned a sensitive-field denylist applied at auditMiddleware. That's correct, but it's an application-layer fix on a schema that allows everything. **Defense in depth needs schema-level constraints too:**

**Fix dispatch:**
```
1. CHECK constraints on JSONB content:
   ALTER TABLE audit_log ADD CONSTRAINT audit_log_no_sensitive_fields CHECK (
     NOT (
       old_values ?| ARRAY['password', 'password_hash', 'totp_secret', 'recovery_code',
                            'paymongoTransferId', 'paymongo_transfer_id',
                            'access_token', 'refresh_token', 'api_key', 'webhook_secret']
       OR
       new_values ?| ARRAY[ ... same list ... ]
     )
   );
   -- Same for admin_actions.details

2. Application-layer redaction at auditMiddleware (CRIT-135 fix dispatch).

3. Migration script to retroactively redact existing rows:
   UPDATE audit_log SET old_values = old_values - 'password' - 'password_hash' - ...,
                        new_values = new_values - 'password' - 'password_hash' - ...
   WHERE old_values ?| ARRAY[...] OR new_values ?| ARRAY[...];

4. Add a tamper-evident hash chain to audit_log:
   ALTER TABLE audit_log ADD COLUMN row_hash CHAR(64);
   ALTER TABLE audit_log ADD COLUMN prev_row_hash CHAR(64);
   -- Trigger computes row_hash = sha256(prev_row_hash || row_content) on INSERT.
   -- Append-only: trigger raises exception on UPDATE/DELETE.

5. Tests:
   - INSERT with `password` field in old_values → CHECK violation 23514.
   - UPDATE on audit_log → trigger blocks.
   - DELETE on audit_log → trigger blocks.
   - Hash chain verification job runs nightly: catches retroactive tampering.

6. Bundle with CRIT-135 (audit log secret leak) and CRIT-150 (sensitive setting display) into a unified "audit + secret" dispatch.
```

---

### CRIT-153 — No `erasure_executions` table; CRIT-136 (erasure DSR doesn't actually erase) confirmed at schema level
**Files:**
- Grep `CREATE TABLE.*erasure` returns zero results across migrations.
- [packages/api/migrations/057_compliance_consent_dsr.sql:25-40](packages/api/migrations/057_compliance_consent_dsr.sql#L25) — DSR table has `status` CHECK with only ('received', 'in_progress', 'completed', 'rejected'); no 'erasure_executed' state.

F04 CRIT-136 found the UI literally tells the DPO that "Mark Complete does NOT delete the customer's data." The schema confirms why: there's nowhere to record what was erased, by whom, when, with what scope.

Without an erasure_executions table:
- `markDsrComplete` flips DSR status to 'completed' regardless of actual erasure.
- No audit trail of which tables/rows were anonymized or hard-deleted.
- No way to verify completeness ("did the worker hit all 12 PII-containing tables?").
- No way to flag "completed" DSRs that didn't actually erase, for retroactive correction.
- NPC RA 10173 §16(d) violation: erasure right not technically met.

**Fix dispatch (extension of CRIT-136 fix):**
```
1. New migration 089_erasure_executions.sql:
   CREATE TABLE erasure_executions (
     id UUID PRIMARY KEY DEFAULT uuidv7(),
     dsr_id UUID NOT NULL REFERENCES data_subject_requests(id),
     started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     completed_at TIMESTAMPTZ,
     started_by UUID NOT NULL REFERENCES users(id),
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
     plan JSONB NOT NULL,         -- { tables: [{name, action: 'hard_delete'|'anonymize', count: N}] }
     result JSONB,                -- per-table actual counts on completion
     error_summary TEXT,
     hash_proof CHAR(64),         -- SHA256 of plan + result for tamper-evidence
     CHECK ((status IN ('completed', 'failed', 'partial')) = (completed_at IS NOT NULL))
   );

   CREATE INDEX idx_erasure_executions_dsr ON erasure_executions(dsr_id);
   CREATE INDEX idx_erasure_executions_pending ON erasure_executions(started_at)
     WHERE status IN ('pending', 'running');

2. Update data_subject_requests CHECK to include 'erasure_executed' as a status:
   ALTER TABLE data_subject_requests DROP CONSTRAINT data_subject_requests_status_check;
   ALTER TABLE data_subject_requests ADD CONSTRAINT data_subject_requests_status_check
     CHECK (status IN ('received', 'in_progress', 'awaiting_more_info', 'erasure_executed', 'completed', 'rejected', 'escalated_to_npc'));

3. Add audit_actions verbs:
   'erasure_executed', 'erasure_failed', 'erasure_partial'

4. Hard-block markDsrComplete for requestType='erasure' UNTIL an erasure_executions row exists with status='completed'.

5. Bundle with CRIT-136 fix dispatch.
```

---

## MEDIUM bugs (continuing from MED-379)

### MED-380 — Migration numbering gap: 060-069 missing
**Files:** `ls packages/api/migrations/` shows 001-059 then 070-088. No files for 060 through 069.

Phase 13 (the dispatch tag for migration 059) ended at 059. Phase 14 D01 started at 070. The 60-69 range is intentionally skipped per Phase 14 dispatch numbering convention (D01=070, D02=071, etc.). Comment in migration 074 line 45-47 confirms: "Migration numbering: D05-plan.md spec said 073, but 073_founding_tier.sql was already taken by D03. Per .ai-coder/decisions/D05-spec-vs-schema.md (Ken's Option A, 2026-04-30), all D05 migrations shift +1 from spec."

This is intentional but undocumented in a top-level README. **Fix:** add a one-line comment in `packages/api/migrations/README.md` explaining the numbering convention.

### MED-381 — BIGINT → JS Number coercion via pg-types parser loses precision above 2^53 (~₱90B aggregate)
**Files:** [packages/api/migrations/059_money_columns_to_bigint.sql:14-17](packages/api/migrations/059_money_columns_to_bigint.sql#L14)

```
-- Companion runtime change: pg-types OID 20 parser registered in
--   packages/api/src/config/database.config.ts
-- to coerce BIGINT → JS Number (Option B; see LAUNCH-LIMITATIONS §15).
```

JS Number safely represents integers up to 2^53 = ~9 quadrillion. For centavos that's ~₱90 billion total in any single column read. At Boracay launch volume (small), this is fine. But aggregate platform_revenue, accumulated escrow holds, or large B2B contract pipeline could approach this in 5-10 years. At that point, math drifts silently.

**Fix:** documented as launch limitation §15. For Phase I, no immediate action. For v1.1+, migrate to `BigInt` JS type via custom parser.

### MED-382 — Cancellation refund tiers exist in TWO sources of truth: platform_settings rows (migration 050) AND cancellation_policies table (migration 071)
**Files:**
- [packages/api/migrations/050_platform_settings_rich_schema.sql:62-68](packages/api/migrations/050_platform_settings_rich_schema.sql#L62) — old: 7 platform_settings keys (cancel_refund_*)
- [packages/api/migrations/071_cancellation_policy.sql:38-82](packages/api/migrations/071_cancellation_policy.sql#L38) — new: cancellation_policies table

The Bug 1170/1198 fix (Phase 14 D02) introduced the cancellation_policies table but did NOT delete the old platform_settings rows. They remain visible in the SystemSettingsPage UI under category 'cancellation', editable by any admin (per CRIT-147). Edits to those settings are no-ops because pricing.service.ts reads from cancellation_policies.

**Fix:** new migration to mark the obsolete platform_settings rows as `is_active=false` so they're hidden from the admin UI. Document the historical reason in the migration comment.

### MED-383 — SiguradoShield protection settings remain in platform_settings (deprecated) but still editable in admin UI
**Files:** [packages/api/migrations/050_platform_settings_rich_schema.sql:70-93](packages/api/migrations/050_platform_settings_rich_schema.sql#L70)

The migration's own comment (lines 70-85) states that protection settings are deprecated for v1.0 (Phase 14 D04 SiguradoShield pull) but kept "because historical migrations are immutable (Phase 14 hash-chain integrity rule)." Admin UI shows them; junior admin can edit them; nothing reads them.

**Fix:** new migration to mark them `is_active=false`. Pattern same as MED-382.

### MED-384 — Consent VERSIONS are stored as `admin_actions` rows (action_type='consent_version_published'), not in a proper table
**Files:**
- [packages/api/src/services/compliance-admin.service.ts:16](packages/api/src/services/compliance-admin.service.ts#L16) — comment "Consent versions: there is no consent_versions table."
- Grep confirms no `CREATE TABLE.*consent_versions`.

A domain entity (consent versions: type, version, effective_at, change_summary) is stored in the audit log table, filtered by action_type. Implications:
- No FK from consent_records.version to a registry — F04 MED-330 confirmed at schema level.
- No DROP/ARCHIVE workflow.
- Querying versions requires WHERE filter on admin_actions.
- Audit trail mixes "published a consent version" with "credited a customer wallet" in the same table.

**Fix:** new migration creating `consent_versions` table with proper schema:
```sql
CREATE TABLE consent_versions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'privacy_policy', 'terms_of_service', 'marketing_consent',
    'ic_agreement', 'cookie_policy', 'data_processing', 'biometric_consent'
  )),
  version TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL CHECK (effective_at >= '2026-01-01'),
  change_summary TEXT NOT NULL CHECK (length(change_summary) >= 200),
  body_text TEXT NOT NULL,           -- the actual policy text
  body_format TEXT NOT NULL DEFAULT 'markdown' CHECK (body_format IN ('markdown', 'html')),
  published_by UUID NOT NULL REFERENCES users(id),
  cosigned_by UUID REFERENCES users(id),  -- two-person rule for high-stakes types
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consent_type, version)
);

ALTER TABLE consent_records ADD CONSTRAINT consent_records_version_fk
  FOREIGN KEY (consent_type, version) REFERENCES consent_versions(consent_type, version);
```

Bundle with CRIT-137 fix dispatch.

### MED-385 — `consent_records.version VARCHAR(20)` is free-text; no FK to a registry (data integrity)
**Files:** [packages/api/migrations/057_compliance_consent_dsr.sql:13](packages/api/migrations/057_compliance_consent_dsr.sql#L13)

Customer's mobile client sends `{ consentType: 'privacy_policy', version: '1.5', granted: true }`. Server stores it. If `consent_versions` doesn't have a matching row (e.g., typo, forgot to publish), the record is orphaned but accepted.

**Fix:** see MED-384. Adding the consent_versions table with a FK closes this.

### MED-386 — Feature flags stored as platform_settings rows; junior admin can edit (CRIT-147 family)
**Files:** [packages/api/migrations/088_d13_feature_flags.sql:14-36](packages/api/migrations/088_d13_feature_flags.sql#L14)

Two feature flags (`feature_flag.promo_redemption_enabled`, `feature_flag.ab_testing_enabled`) seeded as platform_settings rows. Per CRIT-147, any admin can change them. Junior admin sets `feature_flag.promo_redemption_enabled=true` mid-launch, untested promo redemption pipeline activates.

**Fix:** part of CRIT-147 dispatch — feature flag settings need `min_role='super_admin'` enforcement. If feature flags become a separate table (cleaner architecture), add row-level role gate.

### MED-387 — `admin_actions.reason TEXT` is nullable; no per-action enforcement of reason length or presence
**Files:** [packages/api/migrations/014_create_disputes.sql:85](packages/api/migrations/014_create_disputes.sql#L85)

Schema accepts `reason = NULL` or `reason = ''`. F-phase findings showed admin pages either skip the reason field (settings save), hardcode a meaningless reason ('Admin cancellation'), or allow empty (notes deletion). Audit log captures the action but the rationale is missing.

**Fix:**
```sql
ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_reason_required CHECK (
    -- High-stakes actions require reason ≥ 20 chars.
    (action_type IN (
      'provider_suspended', 'provider_banned', 'provider_tier_changed',
      'provider_commission_adjusted', 'customer_suspended', 'customer_credited',
      'booking_cancelled', 'booking_force_completed',
      'dispute_resolved', 'dispute_escalated', 'dispute_reopened',
      'payout_rejected', 'config_changed', 'refund_issued', 'manual_escrow_release',
      'consent_version_published',
      'admin_role_archived'
    ) AND length(coalesce(reason, '')) >= 20)
    OR action_type NOT IN ( ... same list ... )
  );
```

### MED-388 — `audit_log` has no partitioning by date; will grow unbounded
**Files:** [packages/api/migrations/009_create_audit_log.sql:4-21](packages/api/migrations/009_create_audit_log.sql#L4)

Single non-partitioned table. After 1 year of operation at modest volume (10K bookings/month × 5 audit rows/booking = 50K/month = 600K/year), still query-able. At scale (100K bookings/month), the table grows ~6M rows/year. Query performance degrades.

**Fix:** declarative monthly partitioning:
```sql
CREATE TABLE audit_log_2026_05 PARTITION OF audit_log FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
-- and so on, with a cron creating the next month's partition.
```
For Phase G, a launch-limitation note. Not launch-blocking.

### MED-389 — `audit_log` rows are mutable (no append-only enforcement at DB level)
**Files:** [packages/api/migrations/009_create_audit_log.sql](packages/api/migrations/009_create_audit_log.sql)

No trigger blocks UPDATE/DELETE. A malicious admin (or compromised admin account) can edit history. Application-layer discipline only.

**Fix:**
```sql
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are immutable (op: %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

Same for admin_actions.

### MED-390 — `wallet_transactions` has no `idempotency_key` or unique constraint on (booking_id, type) for one-time events
**Files:** [packages/api/migrations/005_create_wallets.sql:23-37](packages/api/migrations/005_create_wallets.sql#L23)

If a payment webhook fires twice (PayMongo retry), both inserts succeed. Same booking_id, two `payment` type rows, double credit to the wallet.

Application-layer idempotency might prevent this (Phase B audit may have flagged), but the schema accepts duplicates.

**Fix:**
```sql
-- For one-shot transaction types per booking:
CREATE UNIQUE INDEX idx_wallet_tx_booking_unique ON wallet_transactions (booking_id, type)
  WHERE type IN ('payment', 'escrow_hold', 'escrow_release', 'commission', 'refund');

-- OR: add idempotency_key column:
ALTER TABLE wallet_transactions
  ADD COLUMN idempotency_key TEXT,
  ADD CONSTRAINT wallet_tx_idempotency_unique UNIQUE (idempotency_key);
```

Bundle with CRIT-19/20/21 family (webhook handlers incomplete from Phase B).

### MED-391 — `otp_codes.code VARCHAR(6)` stored plaintext; should be hashed
**Files:** [packages/api/migrations/001_create_users.sql:30-38](packages/api/migrations/001_create_users.sql#L30)

If DB is breached, attacker reads recent OTP codes for any phone, uses them to log in (within the 5-minute expiry window). Defense-in-depth: hash with HMAC-SHA256 + per-row salt or bcrypt before storage; verify by hashing the user's input.

**Fix:** new migration adds `code_hash TEXT NOT NULL`, drops `code`. Application updates accordingly. Backfill existing rows is unnecessary — OTPs expire in 5 minutes.

### MED-392 — `device_fingerprints UNIQUE(user_id, fingerprint)` creates many rows per user when fingerprint is non-deterministic (CRIT-119 family)
**Files:** [packages/api/migrations/026_security_enhancements.sql:23-34](packages/api/migrations/026_security_enhancements.sql#L23)

Phase E CRIT-119: mobile's device-fingerprint.service.ts includes Date.now() in hash input → non-deterministic. Each session creates a new fingerprint → new row in device_fingerprints. UI shows "many devices for this user." Storage bloat, false fraud signals.

**Fix:** part of CRIT-119 dispatch (mobile-side fix). Schema is fine; the application generates bad input.

### MED-393 — `promo_codes.discount_value` is polymorphic on `discount_type`; LAUNCH-LIMITATIONS §14 acknowledged but unfixed
**Files:** [packages/api/migrations/059_money_columns_to_bigint.sql:71-76](packages/api/migrations/059_money_columns_to_bigint.sql#L71)

Same column stores percentages (10 = 10%) AND centavos (50000 = ₱500). Schema-level antipattern. Comment acknowledges the gap.

**Fix:** v1.1+ migration to split into `discount_percent INTEGER` (0-100) and `discount_centavos BIGINT`. Application reads whichever is non-null. Documented as launch limitation; acceptable for v1.0 with the understanding that promo redemption is feature-flag-disabled (CRIT-146).

### MED-394 — `cancellation_policies.provider_no_show_credit_php INTEGER` stores PESOS, not centavos (F06 MED-370 schema-confirmed)
**Files:** [packages/api/migrations/071_cancellation_policy.sql:46](packages/api/migrations/071_cancellation_policy.sql#L46)

Comment at line 63 confirms intentional: "Platform-funded apology credit (in pesos) for provider-no-show events. Separate from tier table because it is not a customer-cancellation tier."

The intent is admin-readable directly in pesos. But every other money column in the platform is centavos. Future code that reads this column without knowing the unit treats it as centavos and divides by 100, displaying a 100× smaller value.

**Fix:** rename column `provider_no_show_credit_pesos` for explicit clarity OR migrate to centavos.

### MED-395 — `users.role` CHECK has only 4 values ('customer', 'provider', 'admin', 'super_admin'); DPO is determined by another mechanism
**Files:** [packages/api/migrations/001_create_users.sql:14-15](packages/api/migrations/001_create_users.sql#L14)

Phase 14 D08 introduced `requireDpoRole` middleware. The DPO designation lives in `admin_roles.permissions` (per migration 046, to confirm), not in `users.role`. Documentation gap: any reader of users.role thinks "admin" is the most privileged staff role.

**Fix:** documentation comment in migration 001 OR a future migration introducing `dpo` as a fifth role. Phase I dispatch decision.

### MED-396 — `bookings.address` denormalizes customer address into every booking row; erasure must scrub each
**Files:** [packages/api/migrations/004_create_bookings.sql:26-31](packages/api/migrations/004_create_bookings.sql#L26)

Each booking has `address TEXT NOT NULL` + barangay + city + province + lat/lng. When a customer files an erasure DSR, every historical booking row contains their address. CRIT-136 fix dispatch's erasure executor must anonymize these.

**Note:** denormalization is intentional (provider needs the address even if customer changes it). Erasure plan covers it.

### MED-397 — No tamper-evident hash chain on `audit_log` or `admin_actions`
**Files:** migrations 009, 014.

Append-only via app discipline only. A malicious admin with DB access can edit history. **Fix:** see CRIT-152 dispatch (hash chain on audit_log).

### MED-398 — Migrations have no DOWN/REVERT scripts; every change is forward-only
**Files:** all 77 migrations.

A bad migration can't be rolled back — only fixed forward. For most schema changes this is fine (modern doctrine). But for high-stakes changes (RLS rollout per CRIT-151), reversal would be desirable. **Fix:** for new migrations, add a paired `_revert.sql` for reversible operations.

---

## LOW / INFO — schema patterns that are CORRECT

- **`provider_documents` table EXISTS** (migration 085). Schema for KYC docs is correct. The CRIT-128 problem is service-layer wire-up, not schema. Major correction to F03 finding.
- **`breach_log` table** (migration 082) — well-architected with NPC §38 SLA tracking, partial index for pending notifications, type/status CHECK constraints, occurred-before-discovered invariant.
- **`cancellation_policies` table** (migration 071) — gold-standard pattern. Versioned, in-place 1-hour edit window enforced by CHECK constraint at app layer, JSONB tier validation by app layer (Zod), seed version 1 included. Comments explain the entire model.
- **`admin_csrf_tokens` table** (migration 070) — Bug 1251 fix verified. Per-session tokens, expiry, revocation, partial index on active rows.
- **`admin_backup_codes` table** (migration 087) — Bug 360 fix verified. bcrypt-hashed, used_at + used_ip tracking, soft-delete for regeneration.
- **Money columns are BIGINT post-migration 059.** All 37 money columns inventory'd in the comment + ALTERed in single transaction. Companion `pg-types` parser registered.
- **`wallets.available_balance >= 0` CHECK** (migration 005:15) — DB-level invariant prevents wallet from going negative. **Mitigates F03 CRIT-134**: admin attempt to debit a wallet beyond balance fails with constraint violation 23514. The CRIT remains for the UX (admin sees opaque error) but money loss is prevented.
- **`platform_settings.requires_restart`** flag — schema acknowledges some settings need server restart. UI doesn't surface it (page-level finding).
- **`disputes` CHECK `valid_resolution`** (migration 014:46-48) — when status='resolved', resolution_type AND decision_notes must be present. Schema-enforced workflow invariant.
- **`security_events` table** (migration 026) — separate from audit_log for security-specific events. Good separation.
- **`login_attempts.locked_until`** — escalating lockout supported at schema level.
- **Phase 14 D08 audit verbs** (`audit_log_exported`, `consent_search`, `pii_reveal`, `breach_logged`, `breach_npc_notified`, `breach_status_changed`, `dsr_action_dispatched`) — all added to admin_actions CHECK. Bug 401/402 verified.
- **`admin_actions` CHECK constraint extended via DROP + ADD pattern** in migrations 075, 080, 082, 085, 087. Each phase adds new verbs. Maintenance burden but auditable.
- **Indexing is comprehensive.** Foreign keys, partial indexes for hot queries, composite indexes for the dashboard.
- **TIMESTAMPTZ used consistently** for all time columns. UTC stored, Asia/Manila displayed at app layer.
- **`uuidv7()` used for time-ordered UUIDs** on most tables added Phase 5+. Better index locality than v4.
- **CASCADE behavior is consistent**: ON DELETE CASCADE for child rows that should disappear with parent (refresh_tokens, otp_codes, dispute_evidence, push_tokens). ON DELETE SET NULL for FK references that should be retained for audit (admin_actions.admin_id, breach_log.reported_by).
- **migrations/074 D05 fix** — PH lat/lng + radius bounds enforced as DB CHECK constraints. Defense-in-depth with the Zod validator at the API layer.
- **Bug 1170/1198 cancellation policy** — gold-standard fix verified at schema, validator, service, and UI layers.

---

## Cross-cutting families this phase newly fed

- **Defense-in-depth gaps** (CRIT-151) — no RLS, no tamper-evident audit log, no DB-level reason CHECK on admin_actions. Single Phase I dispatch: "RLS + tamper-evident audit + reason enforcement."
- **Schema exists but service drifts** (CRIT-128 correction, MED-384) — provider_documents schema exists, service returns nulls; consent_versions stored as admin_actions instead of own table. Pattern: schema is right, service is wrong.
- **Stale platform_settings rows** (MED-382, MED-383, MED-386) — old cancellation refund rows + SiguradoShield + feature flags stored alongside live settings. Admin UI shows them all editable. Single Phase I dispatch: hide stale settings.
- **Duplicate sources of truth for the same data** (CRIT-141 from F04 + MED-382 + MED-384) — pattern keeps recurring across phases.
- **No idempotency keys on financial transactions** (MED-390) — couples with CRIT-19/20/21 webhook handler family.

---

## Phase G running totals

| | Lines fully read | Findings docs |
|---|---:|---|
| **G — Migrations + RLS** | **~2,400** (of 3,999 total SQL; rest verified via grep) | **1** |

| | New CRITs | New MEDs |
|---|---:|---:|
| G | 3 (CRIT-151, 152, 153) | 19 (MED-380 through MED-398) |

**Cumulative audit totals after Phase G:**
- ~76,200 lines fully read (~54.3% of ~140,380 codebase)
- **153 CRITICAL** bugs (1 invalidated → **152 real**)
- **398 MEDIUM** bugs

**Top G fixes by impact:**

1. **CRIT-151 (no RLS)** — defense-in-depth dispatch. Phased per-table rollout. Not launch-blocking IF application layer is hardened by Phase I; high value otherwise.
2. **CRIT-152 + MED-389 + MED-397** — audit log integrity dispatch: schema-level CHECK constraints on JSONB content + tamper-evident hash chain + append-only triggers. Bundle with CRIT-135 + CRIT-150.
3. **CRIT-153 (no erasure_executions table)** — bundle with CRIT-136 fix dispatch. Migration adds the table; service implements the executor.
4. **CRIT-128 correction** — update F03 dispatch. Schema exists; fix is service-layer wire-up only. Smaller and faster.
5. **MED-384 (consent_versions table missing)** — bundle with CRIT-137 fix dispatch.

---

## What's left after Phase G

### Phase H — Test quality audit (~20,000 lines, ~2 sessions)
- Test files in `packages/api/__tests__/`, `apps/admin/src/**/__tests__/`, `apps/mobile/__tests__/`.
- Patterns to look for: `expect(existsSync(...))` (file-existence-as-test), `expect(closeout.match(/Bug NNNN/))` (source-content regex), multi-bug test names, `it.todo` skipped without specific reason, "render but don't assert."
- Cross-reference: Phase 14 R5/R6/R7 remediation tests should be verified per F#7 audit lesson.

### Phase I — Master AI-coder dispatch (~1 session)
- Synthesize 152 CRITs + 398 MEDs into ~25-30 deployable dispatches.
- Reference CancellationPolicyPage as gold-standard template.
- Bundle related CRITs (e.g., staff-permissions super-dispatch, PII-redaction dispatch, audit-log integrity dispatch, launch-blocking erasure + KYC dispatch).
- Each dispatch: files to edit (with line numbers from F-phase + G-phase findings), migration steps, server changes, client changes, tests required (real-render + assertion), runtime verification protocol (Docker + seed scripts + click-paths + screenshot checks), rollback plan.

---

## Discipline notes from this phase

1. **Cross-checking schema before writing CRITs is mandatory.** F03 CRIT-128 was wrong about the schema gap — Phase G corrected. The lesson: a service code comment ("Government ID + selfie fields not present in current schema") is NOT proof the schema lacks the columns. Migration files are the source of truth.

2. **The Phase 14 D-series dispatches landed real, well-architected migrations.** Migrations 070, 071, 074, 080, 082, 085, 087, 088 are all consistent with the F-phase findings — schemas are right, service/UI wire-up is the gap. This is a key insight for Phase I: most fixes are in the application layer, not migration layer.

3. **Migration immutability is a discipline, not a constraint.** The codebase treats migrations as immutable (Phase 14 hash-chain integrity rule). Stale rows from old migrations (cancellation refund settings, SiguradoShield protection rows) are documented in comments rather than removed. Phase I should respect this — fixes go in NEW migrations that mark old data inactive, not by editing past migrations.

4. **No RLS is the single biggest defense-in-depth gap.** It's a CRIT but not launch-blocking — if Phase I tightens application-layer authorization (149+ CRITs), RLS becomes a backstop rather than a primary defense. With RLS, the same gaps are double-blocked.

5. **The audit log + admin_actions tables both have JSONB columns that accept anything.** CRIT-135 + CRIT-150 + CRIT-152 + MED-389 + MED-397 are the same family at different layers (UI display, schema CHECK, immutability, hash chain). Single Phase I dispatch closes them all.
