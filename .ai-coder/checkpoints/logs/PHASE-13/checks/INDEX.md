# Phase 13 — Checks Index

| Check ID | Description | Status | Evidence |
|---|---|---|---|
| CHK-001 | Forbidden patterns: 0 absolute, 0 introduced | PASS | `gates/gate-1-forbidden.log` |
| CHK-002 | TypeScript: 3 workspaces (admin/mobile/api) compile, 0 errors | PASS | `gates/gate-1-typecheck.log` |
| CHK-003 | Lint: 0 warnings at repo root | PASS | `gates/gate-1-lint.log` |
| CHK-004 | Jest: 876 / 876 tests pass across 44 suites (api workspace) | PASS | `gates/gate-2-alltests.log` |
| CHK-005 | Money-conservation invariant: all sacred money tests pass | PASS | `gates/gate-5-money.log` |
| CHK-006 | Migrations validate (058 compliance verbs + 059 BIGINT) | PASS | `gates/gate-5-migrations.log` |
| CHK-007 | N+1 absolute count tracked: 30 deferred, 0 introduced, 0 unjustified SAFE | PASS | `gates/gate-5-n-plus-1.log` |
| CHK-008 | Mutation per-phase delta gate (TD-005): SKIP (0 sacred files touched) | PASS | `gates/gate-3-mutations.log` |
| CHK-008b | Mutation full sweep on 7 sacred files (refund.service deferred) | See `dispatch-G/mutation-summary.md` | `dispatch-G/mutation-full.log` |
| CHK-009 | Design tokens sync (CSS ↔ tokens.json) via Jest test (7 sub-tests) | PASS | `gates/gate-1-design-tokens.log` (jq SKIP in dev) + design-tokens-sync.test.ts |
| CHK-010 | k6 load test gate (SKIP in dev, no LOADTEST_BASE_URL) | SKIP | `gates/gate-4-load.log` |
| CHK-011 | Admin CSP configured | PASS | `apps/admin/vercel.json` |
| CHK-012 | Winston PII masking | PASS | `packages/api/__tests__/logger-pii-masking.test.ts` |
| CHK-013 | Password hash format scrypt N=131072 + opportunistic rehash | PASS | `packages/api/__tests__/auth-password-rehash.test.ts` |
| CHK-014 | CORS allowlist | PASS | `packages/api/__tests__/cors-allowlist.test.ts` |
| CHK-015 | hCaptcha utility tested (production wire-up deferred) | PASS | `packages/api/__tests__/hcaptcha-verify.test.ts` |
| CHK-016 | A11y baseline patterns via jest-axe (4 tests) | PASS | `packages/api/__tests__/admin-a11y-baseline.test.tsx` |
| CHK-017 | Internal markdown links | PASS | manual link sweep (Dispatch F) |
| CHK-018 | Cooling-off SAFE-N+1 annotated and justified | PASS | `packages/api/src/services/data-management.service.ts:341` |
| CHK-019 | DSR flow end-to-end (18 tests) | PASS | `packages/api/__tests__/compliance-dsr-flow.test.ts` |
| CHK-020 | BIGINT precision documented + tested | PASS | `packages/api/__tests__/bigint-money-precision.test.ts` + LAUNCH-LIMITATIONS §15 |
| CHK-021 | Phantom-test scan: 0 absolute, 0 introduced | PASS | `gates/gate-1-phantom-tests.log` |
| CHK-022 | Emoji-as-icon scan: 0 absolute, 0 introduced | PASS | `gates/gate-1-emoji.log` |
| CHK-023 | Dependency check (jq SKIP in dev) | PASS | `gates/gate-1-deps.log` |
| CHK-024 | Reconciliation audit (Dispatch A) committed | PASS | `RECONCILIATION-AUDIT.md` |
| CHK-025 | HASHES-CORRECTED for phases 00-12 | PASS | `logs/PHASE-NN/HASHES-CORRECTED.sha256` (each prior phase) |
| CHK-026 | Evidence audit (paper-trace, boundaries, premortem, future-bugs, INDEX, EVIDENCE-MANIFEST, HONESTY-CHECK) | PASS | `gates/gate-6-evidence-audit.log` (final) |
| CHK-027 | Sanity-checks log present and entries ≥ significant changes | PASS | `sanity-checks.log` |
| CHK-028 | Hash chain regenerated and verifiable | PASS | `HASHES.sha256` |

## Files at a glance (Phase 13 totals)

- 1 new migration: `058_compliance_admin_action_verbs.sql`
- 1 new migration: `059_money_columns_to_bigint.sql` (37 ALTERs)
- 7 new api services / utilities: compliance-admin, hcaptcha verifier, scrypt rehash, PII mask format, BIGINT parser, invoice batch CTE, admin-analytics tier aggregate
- 11+ new test files (compliance DSR flow, booking admin message, logger PII masking, auth password rehash, CORS allowlist, hCaptcha verify, BIGINT precision, invoice bulk batch, admin-analytics tier aggregate, design-tokens-sync, admin-a11y-baseline)
- 2 new admin pages: DataProtectionLogPage, ConsentVersionsPage
- 1 new mobile screen: data-rights.tsx
- 4 a11y sweep batches across 187 admin controls
- 1 doc tree consolidation (root → `docs/architecture`, `docs/strategy`, `docs/ai-coder`, `docs/audits`)
- 2 new top-level docs: INFRA-CHECKLIST.md, LAUNCH-LIMITATIONS.md
- 1 new harness gate: `scripts/verify-load.sh` (k6)
- 1 new dev wire: `@axe-core/react` in admin main.tsx
