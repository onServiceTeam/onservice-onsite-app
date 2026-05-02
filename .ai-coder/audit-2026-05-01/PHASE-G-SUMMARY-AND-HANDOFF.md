# Audit 2026-05-01 — Phase G COMPLETE — Migrations + RLS audit done

**Status:** Phases A + B + C + D + E + F + G complete. Phase H (test quality audit) is next, then Phase I (master AI-coder dispatch).

**Master commit at audit start:** `b8bd2f2`. Working tree clean apart from `.ai-coder/audit-2026-05-01/` (untracked).

---

## Phase reads to date

| Phase | Status | Lines fully read | Findings docs |
|---|---|---:|---|
| A — Inventory + risk ranking | ✅ Done | n/a | INVENTORY.md |
| B — Money path | ✅ Done | 13,599 | B01–B09 (9 docs) |
| C — Auth + RBAC + sessions | ✅ Done | 6,075 | C01–C05 (5 docs) |
| D — Customer mobile | ✅ Done | 18,979 | D01–D12 (12 docs) |
| E — Provider mobile | ✅ Done | 14,031 | E01–E06 (6 docs) |
| F — Admin web | ✅ Done | ~21,111 | F01–F07 (7 docs) |
| **G — Migrations + RLS** | ✅ **DONE** | **~2,400 fully read of 3,999 SQL (rest grep-verified)** | **G01 (1 doc)** |
| H — Test quality audit | Pending | 0 | — |
| I — Master AI-coder dispatch | Pending | 0 | — |

**Codebase total: ~140,380 lines.** Coverage so far: **~76,200 / 140,380 = ~54.3%**.

---

## Phase G summary — what was audited

77 migration files, 3,999 SQL lines total. Read foundational tables (001-014), security infrastructure (026, 047, 070, 087), platform settings (038, 050, 051), money widening (059), launch-critical (071 cancellation, 074 D05 bounds, 088 feature flags), compliance (057, 058, 080, 082, 085) in full. Remaining migrations verified via grep for CHECK constraints, money columns, RLS policies, table creation.

**Headline counts: +3 CRITs, +19 MEDs.**

### G01 — Migrations + RLS

| Severity | Count |
|---|---:|
| CRIT-151 | No Row-Level Security policies anywhere in the schema |
| CRIT-152 | audit_log JSONB columns have no schema-level redaction (CRIT-135 root cause) |
| CRIT-153 | No `erasure_executions` table (CRIT-136 confirmed at schema level) |

| MED | Topic |
|---|---|
| MED-380 | Migration numbering gap 060-069 (intentional, undocumented) |
| MED-381 | BIGINT → JS Number coercion loses precision above 2^53 (~₱90B aggregate) |
| MED-382 | Cancellation refund tiers in TWO sources (platform_settings + cancellation_policies) |
| MED-383 | SiguradoShield protection settings remain in platform_settings (deprecated) |
| MED-384 | `consent_versions` is stored as admin_actions rows, not a proper table |
| MED-385 | `consent_records.version` is free-text; no FK to a registry |
| MED-386 | Feature flags stored as platform_settings rows (CRIT-147 family) |
| MED-387 | `admin_actions.reason` nullable; no per-action enforcement |
| MED-388 | `audit_log` not partitioned by date; will grow unbounded |
| MED-389 | `audit_log` rows mutable at DB level (no append-only trigger) |
| MED-390 | `wallet_transactions` no idempotency_key (double-payment risk) |
| MED-391 | `otp_codes.code` stored plaintext; should be hashed |
| MED-392 | `device_fingerprints UNIQUE` creates many rows when fingerprint is non-deterministic |
| MED-393 | `promo_codes.discount_value` polymorphic on discount_type (LAUNCH-LIMITATIONS §14) |
| MED-394 | `cancellation_policies.provider_no_show_credit_php` is PESOS not centavos |
| MED-395 | `users.role` CHECK has 4 values; DPO determined by another mechanism |
| MED-396 | `bookings.address` denormalized; erasure must scrub each row |
| MED-397 | No tamper-evident hash chain on `audit_log` or `admin_actions` |
| MED-398 | Migrations have no DOWN/REVERT scripts |

---

## CRITICAL HONESTY CORRECTION — F03 CRIT-128 was wrong about schema

**F03 CRIT-128** stated: "Government ID + selfie not stored anywhere; the schema literally has no columns for KYC docs."

**That's WRONG.** Migration 085 (Phase 14 D09 Bug 1193/1194/1195) created `provider_documents` with:
- `document_kind` CHECK including 'government_id_front', 'government_id_back', 'selfie_liveness', 'nbi_clearance'
- `s3_key TEXT NOT NULL` for proper S3 storage tracking
- `status` CHECK with workflow states (uploaded → pending_review → approved/rejected)
- Reviewer accountability: `reviewed_by`, `reviewed_at`, `rejection_reason`
- New admin_actions verbs for KYC review lifecycle

**The actual problem is service-layer drift.** `packages/api/src/services/provider-admin.service.ts:51-58` still encodes:
```ts
governmentIdUrl: null;
selfieUrl: null;
// Government ID + selfie fields not present in current schema (see HONESTY-CHECK).
```
The schema IS present; the service just doesn't read it. ProviderDetailPage's "not stored — see HONESTY-CHECK" string is therefore stale.

**Severity:** CRIT-128 is **downgraded in scope** but **not invalidated**. The wire-up gap is real:
- Admin still doesn't see uploaded KYC docs in ProviderDetailPage.
- Providers may still be approved without admin verification (depends on whether the onboarding/upload flow writes to provider_documents).
- The fix is much smaller — service-layer wire-up + UI text removal — not a migration.

**Action:** Phase I dispatch must reflect the correction. CRIT-128 fix is now:
1. Update `provider-admin.service.ts:getProviderProfile()` to query `provider_documents` for the user, group by `document_kind`, return the latest approved row's `s3_key` (or signed URL via the proxied download pattern from CRIT-125).
2. Update ProviderDetailPage to show real document URLs, drop the "not stored" string.
3. Verify the provider onboarding flow (mobile-side) actually uploads to provider_documents (couples with Phase E CRIT-115 — onboarding theatre on the mobile-side may also be partially fixed by D09).

---

## Cumulative running totals

| | Total | Phase G additions |
|---|---:|---:|
| **CRITICAL** | **152 real** (1 invalidated of 153) | **+3** |
| **MEDIUM** | **398** | **+19** |
| Lines fully read | ~76,200 | +2,400 |
| Coverage of ~140,380 codebase | 54.3% | |

---

## What's confirmed real and what's not

Phase G confirms the **Phase 14 D-series dispatches landed real, well-architected migrations**:

- **Migration 070** (Bug 1251 admin CSRF tokens) — real, defensible.
- **Migration 071** (Bug 1170/1198 cancellation policy) — gold-standard pattern. Use as template.
- **Migration 074** (D05 service area bounds + caps) — real, with both DB CHECK constraints AND Zod validators.
- **Migration 080** (D08 Bug 117 consent_type CHECK) — real, with backfill of existing typos before adding the constraint.
- **Migration 082** (D08 Bug 1366 breach_log) — real, with NPC §38 SLA tracking.
- **Migration 085** (D09 Bug 1193/1194/1195 provider_documents) — real, exactly the schema F03 CRIT-128 said was missing. Service layer hasn't caught up.
- **Migration 087** (D10 Bug 360 admin backup codes) — real, bcrypt-hashed.
- **Migration 088** (D13 Bug 44/45 feature flags) — real, default false, gated.

**Phase 14 D-series is not theatre.** The schemas exist. The remaining work is application-layer wire-up + role gating + audit redaction.

---

## Cross-cutting families confirmed by Phase G

These extend / confirm prior families. Phase I dispatch must address all.

1. **No defense-in-depth at DB level** (CRIT-151) — no RLS, no append-only enforcement, no tamper-evident hash chain. Single dispatch.
2. **Audit log integrity** (CRIT-135 + CRIT-150 + CRIT-152 + MED-389 + MED-397) — same family across UI display, schema CHECK, immutability, hash chain. Single dispatch.
3. **Schema exists but service drifts** (CRIT-128 correction + MED-384) — pattern: schema is right, service is wrong. Phase I dispatches must check schema first before assuming a missing-table fix is needed.
4. **Stale platform_settings rows** (MED-382 + MED-383 + MED-386) — old/deprecated/feature-flag rows alongside live ones. Single dispatch hides them.
5. **Duplicate sources of truth** (CRIT-141 + MED-382 + MED-384) — recurring antipattern.
6. **Idempotency on financial writes** (MED-390 + Phase B CRIT-19/20/21 family) — couples with webhook handler dispatch.
7. **Migration immutability discipline** — fixes go in NEW migrations, not by editing old ones.

---

## What's left

### Phase H — Test quality audit (~20,000 lines, ~2 sessions, NEXT)
Test directories to scan:
- `packages/api/__tests__/` (server tests, ~6,000-10,000 lines)
- `apps/admin/src/**/*.test.tsx` (admin tests)
- `apps/mobile/__tests__/` (mobile tests, possibly the largest test surface)

Patterns to flag (per CLAUDE.md F#7 audit lesson):
- `expect(existsSync(...)).toBe(true)` — file-existence-as-test
- `expect(closeout.match(/Bug NNNN/)).toBeTruthy()` — source-content regex
- Multi-bug test names (forbidden per CLAUDE.md)
- `it.todo` skipped without specific reason
- "Render but don't assert" — test mounts component but doesn't verify behavior
- Phase 14 R5/R6/R7 remediation tests verified for real assertions

### Phase I — Master AI-coder dispatch (~1 session)

Synthesize 152 CRITs + 398 MEDs into ~25-30 deployable dispatches. Each dispatch:
- **Title + impact statement** (1 paragraph)
- **Bundle reference**: which CRITs/MEDs this closes
- **Files to edit** (with line numbers from A-G phase findings)
- **Migration steps** (couple to Phase G missing-tables list: erasure_executions, consent_versions; CRIT-128 correction notes existing provider_documents)
- **Server changes** (route gating, validators, services, middleware)
- **Client changes** (UI, role gates, confirm dialogs, preview previews)
- **Tests required** (real-render + assertion, not file-existence)
- **Runtime verification protocol** (Docker setup, seed scripts, click-paths, screenshot checks per Ken's brief)
- **Rollback plan**

Reference **CancellationPolicyPage + migration 071** as the explicit gold-standard template for all admin mutation dispatches.

**Top dispatches to bundle:**
1. **Launch-blocking compliance dispatch**: CRIT-128 (KYC wire-up) + CRIT-136 (erasure executor) + CRIT-153 (erasure_executions table). Without these, NPC + AMLA non-compliant.
2. **Staff permissions super-dispatch**: CRIT-23 + CRIT-56 + CRIT-120 + CRIT-121 + CRIT-130 + CRIT-131 + CRIT-137 + CRIT-142 + CRIT-144 + CRIT-147 + CRIT-148. 11 CRITs in one server-side rbac middleware tightening + client-side `<RequireRole>` HOC.
3. **PII redaction dispatch**: CRIT-63 + CRIT-132 + CRIT-149. `<RedactPii>` wrapper + granular permissions + audit-on-PII-access.
4. **Audit log integrity dispatch**: CRIT-135 + CRIT-150 + CRIT-152 + MED-389 + MED-397. Sensitive-field denylist at auditMiddleware + DB CHECK constraints + tamper-evident hash chain + append-only triggers.
5. **All-PII-files-proxied dispatch**: CRIT-125 + CRIT-128 (after correction) + CRIT-140. Replace direct S3 URLs with `/download` proxied routes + audit-on-access.
6. **Consent versioning dispatch**: CRIT-137 + CRIT-139 + MED-384 + MED-385. New `consent_versions` table + DPO-only publish + co-sign + FK from consent_records.
7. **Defense-in-depth dispatch**: CRIT-151 (RLS) + MED-389 (append-only) + MED-397 (hash chain). Phased per-table rollout.
8. **Wallet integrity dispatch**: CRIT-133 + CRIT-134 + MED-390 + Phase B CRIT-19/20/21. Idempotency keys + balance preview + co-sign for high amounts + non-negative DB CHECK.
9. **Boracay launch dispatch**: CRIT-77 + CRIT-92 + CRIT-93 + CRIT-111 + CRIT-116 + CRIT-122. Single platform_setting for launch_region + admin editor + CI guard against Manila magic numbers.
10. **'founding' tier dispatch**: CRIT-97 + CRIT-129. Add to all dropdowns + CI guard.
11. **Notification template dispatch**: CRIT-138. Role gate + XSS sanitization + variable validation + test-send + multi-language (Tagalog).
12. **Marketing attribution dispatch**: CRIT-143. Replace direct edit with structured adjustment workflow.
13. **Money math dispatch**: CRIT-145 + MED-285 + MED-345 + MED-394. CI lint on `Number(...) * 100` without Math.round + centavos consistency for cancellation_policies.
14. **Truth-in-UI dispatch**: CRIT-95 + MED-321 + MED-322 + CRIT-146. Remove stub tabs + finalize promo redemption cutover plan.

---

## Resume prompt for next session

> "Continue the audit from `.ai-coder/audit-2026-05-01/`. Phase G is COMPLETE. Read PHASE-G-SUMMARY-AND-HANDOFF.md (this file) first to load state, plus PHASE-F-SUMMARY-AND-HANDOFF.md and findings/G01-migrations-and-rls.md. Then begin **Phase H — Test quality audit**. Inventory test files in `packages/api/__tests__/`, `apps/admin/src/**/*.test.tsx`, `apps/mobile/__tests__/`. Read enough tests to characterize the test landscape (estimate ~20,000 lines total). Watch for the F#7 audit smell: `expect(existsSync(...))`, `expect(closeout.match(/Bug NNNN/))`, multi-bug test names, `it.todo` without reason, render-but-don't-assert. Verify the Phase 14 R5/R6/R7 remediation tests actually assert on real behavior. Write findings/H01-test-quality-server.md and H02-test-quality-client.md (or however many docs). Continue CRIT numbering at CRIT-154 and MEDs at MED-399. Same protocol: full reads, file:line citations, code snippets, fix dispatches with tests + runtime verification, honest line ranges. After Phase H, write PHASE-H-SUMMARY-AND-HANDOFF.md. Then Phase I — synthesize 152+ CRITs into ~25-30 deployable dispatches with full Docker + runtime verification protocols, using CancellationPolicyPage + migration 071 as the gold-standard templates."

---

## Discipline notes carried forward

1. **Cross-checking schema before writing CRITs is mandatory.** F03 CRIT-128 was wrong about the schema. Migration files are the source of truth, not service code comments.

2. **Phase 14 D-series migrations are real.** Schemas exist for the things F-phase complained about. The fix burden is mostly application-layer wire-up + role gating, not new migrations.

3. **No RLS is the single biggest defense-in-depth gap** (CRIT-151) but not launch-blocking IF Phase I tightens application-layer authorization. RLS becomes the backstop, not the primary defense.

4. **Stale settings rows are a UX trap.** Old cancellation refund settings, deprecated SiguradoShield rows, feature flags all share the same admin SystemSettings UI. Junior admin can edit any of them. Single dispatch to mark them inactive.

5. **The audit log integrity story spans 5 findings across 3 phases.** CRIT-135 (UI display) + CRIT-150 (sensitive setting display) + CRIT-152 (schema CHECK) + MED-389 (immutability) + MED-397 (hash chain). Single Phase I dispatch closes them all.

6. **Money widening was comprehensive** (migration 059) but the JS Number coercion (MED-381) caps practical aggregate at ~₱90B. Documented as launch limitation. Acceptable for v1.0.

7. **Migrations are immutable.** Fixes go in NEW migrations that mark old data inactive, not by editing past migrations.

---

## Estimated remaining audit budget

| Phase | Estimate (lines) | Estimated sessions |
|---|---:|---:|
| H — Test quality audit | 20,000 | 2 |
| I — Master AI-coder dispatch | n/a (synthesis) | 1 |
| **Total remaining** | **~20,000** | **~3 sessions** |

Already invested: ~10 sessions (A through G) = ~76,200 lines = ~54.3% of codebase line-by-line + cross-grep verified.
Total program estimate: ~13 sessions to 100% audit + Phase I dispatch.
