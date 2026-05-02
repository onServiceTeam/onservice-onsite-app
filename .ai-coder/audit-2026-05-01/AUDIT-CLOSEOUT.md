# Audit 2026-05-01 — CLOSEOUT

The audit is **DONE.** Eight phases (A-H) read line by line, plus a master AI-coder dispatch (Phase I split into infrastructure + per-CRIT) ready for execution. This is the index doc — start here.

## What this audit produced

```
.ai-coder/audit-2026-05-01/
├── AUDIT-CLOSEOUT.md                                ← this file
├── PHASE-D-PARTIAL-2-HANDOFF.md                     interim handoff (Phase D mid-session)
├── PHASE-D-SUMMARY-AND-HANDOFF.md                   Phase D close
├── PHASE-E-SUMMARY-AND-HANDOFF.md                   Phase E close
├── PHASE-F-SUMMARY-AND-HANDOFF.md                   Phase F close
├── PHASE-G-SUMMARY-AND-HANDOFF.md                   Phase G close
├── PHASE-H-SUMMARY-AND-HANDOFF.md                   Phase H close (also closes Phase I)
├── findings/
│   ├── B01–B09 (9 docs)                             Money path (Phase B)
│   ├── C01–C05 (5 docs)                             Auth + RBAC (Phase C)
│   ├── D01–D12 (12 docs)                            Customer mobile (Phase D)
│   ├── E01–E06 (6 docs)                             Provider mobile (Phase E)
│   ├── F01–F07 (7 docs)                             Admin web (Phase F)
│   ├── G01-migrations-and-rls.md                    Migrations + RLS (Phase G)
│   ├── H01-test-classification.md                   218 test files bucketed (Phase H)
│   ├── H02-feature-coverage-matrix.md               per-flow × variation matrix
│   ├── H03-runtime-harness-gap.md                   what runtime infra exists vs missing
│   ├── I-A-runtime-harness-dispatch.md              ← AI coder starts HERE
│   └── I-B-per-crit-dispatches.md                   ← then 27 dispatches in this order
├── phase-A-inventory/
│   └── INVENTORY.md
├── phase-H-tests/
│   ├── test-signatures.tsv                          per-file pattern counts
│   └── buckets.tsv                                  per-file bucket assignment
└── (phase-B-money/, phase-C-auth/, ... empty placeholder dirs)
```

## Headline numbers

- **155 real CRITICAL bugs** (1 invalidated of 156). Down from initial 12 in Phase 14 audit handoff to ~150 real in this audit.
- **422 MEDIUM bugs**.
- **~77,400 lines source-read in full** = ~55% of the ~140,380-line codebase. The remaining 45% is mostly RN screens, admin shared components, and migration files — all spot-grepped for issue patterns; not all line-by-line.
- **218 test files signature-classified** (100%). 25 are F#7 audit smell. 114 are R7-real shallow. 78 are real behavioral. 1 is mixed.
- **27 deployable AI-coder dispatches** (8 P0 launch-blocking + 12 P1 production + 7 P2 polish).

## How to consume this audit

### If you are Ken

Read in this order:
1. `PHASE-H-SUMMARY-AND-HANDOFF.md` — overall picture + final numbers + what's real vs theatre.
2. `findings/I-B-per-crit-dispatches.md` — the 27 dispatches by priority. Each is sized for one AI-coder session.
3. `findings/I-A-runtime-harness-dispatch.md` — the test infrastructure that has to land FIRST so every other dispatch can prove its fix.
4. Skim each phase summary handoff (D / E / F / G / H) to understand the depth of findings per area.

The 8 P0 dispatches are the launch-blocking critical path. Without them, NPC RA 10173 + AMLA + role-gate failures block release.

### If you are the AI coder

Start at `findings/I-A-runtime-harness-dispatch.md`. Land Wave 0 (test harness package + first 3 flow specs + Gate B replacement) before touching production code.

After Wave 0 lands + CI is green, proceed sequentially through the 8 P0 dispatches in `findings/I-B-per-crit-dispatches.md`. Each must end with a green E2E flow + evidence bundle as proof.

For each per-CRIT dispatch, the relevant context is in:
- `findings/F01–F07` for admin-web findings (file:line citations)
- `findings/E01–E06` for provider-mobile findings
- `findings/D01–D12` for customer-mobile findings
- `findings/C01–C05` for auth findings
- `findings/B01–B09` for money-path findings
- `findings/G01-migrations-and-rls.md` for schema findings (and the CRIT-128 honesty correction)
- `findings/H01-test-classification.md` for the test buckets to delete / augment / keep

Use CancellationPolicyPage + migration 071 + proof/login.dom.test.tsx as gold-standard templates.

## What's confirmed real (Phase 14 D-series fixes)

Verified at code + schema + test level:
- Cancellation policy (Bug 1170/1198) — gold-standard pattern.
- Admin CSRF (Bug 1251) + native fetch wrapper (Bug 1271).
- PH lat/lng + radius bounds (Bug 320/322).
- Consent type CHECK constraint (Bug 117).
- Audit log self-audit on CSV export (Bug 401) + DPO consent search (Bug 402).
- Breach log + 72h NPC SLA (Bug 1366).
- Provider documents schema for KYC (Bug 1193/1194/1195) — schema EXISTS; service-layer wireup is the gap (Phase G honesty correction to F03 CRIT-128).
- Admin TOTP backup codes (Bug 360).
- Feature flags for v1.0 pulls (Bug 44/45/152).
- Money widening to BIGINT (Phase 13 Dispatch E).
- 74 REAL-UNIT test files including escrow-money-conservation, commission, all 19 validators.

Phase 14 is **not theatre**. The audit found gaps that survived multiple dispatches — not a wholesale dismissal.

## What's theatre (the dispatches close)

- 25 SRC-REGEX test files (delete + replace with real behavior tests).
- Gate B "reference coverage" CI rule (replace with behavioral-coverage check).
- 114 R7-real shallow render tests (keep + pair with `*.behavior.test.tsx`).
- "Government ID — not stored" UI string while schema has provider_documents.
- Erasure DSR "Mark Complete" doesn't actually erase data.
- All platform settings editable by junior admin (`rbacMiddleware('admin', 'super_admin')` at router level).
- 11 protected mutations gated only by `requireAdmin` (admin OR super_admin) instead of super_admin.

## Estimated effort to close

- **Wave 0** (Phase I-A test harness): 1 week of AI coder.
- **Wave 1** (8 P0 launch-blocking): 4 weeks of AI coder.
- **Wave 2** (12 P1 production-quality): 3 weeks of AI coder.
- **Wave 3** (7 P2 polish): post-launch v1.1, ~2 weeks.
- **Manual operator sessions**: F#3 Maestro baseline capture, F#4 Playwright baseline capture (per existing `.ai-coder/handoff/F3-*` and `F4-*` docs).

**Total: 8-9 AI-coder weeks + 2 operator sessions to reach `v1.0.0-launch-ready`.**

## Remaining audit gap (honest)

This audit covered:
- Source code line-by-line for ~55% of the codebase (the high-stakes paths: money, auth, admin, key mobile flows, all migrations).
- All 218 test files via signature + spot reads.
- Cross-grep verification for the remaining 45% on specific issue patterns (URL drift, role gating, money math, RLS, CHECK constraints).

This audit did NOT cover:
- Every individual mobile screen's layout details.
- Every UI component prop / styling decision.
- Performance benchmarks under load (Phase 27 in your brief — defer to v1.1).
- Browser-compat matrix on real devices (Phase 22/23 — defer to manual operator sessions during F#3/F#4).
- Every CSS file / Tailwind config (low-leverage for the issues found).
- The Terraform infra dir contents (separate launch-prep operational work per CLAUDE.md F#10 + 12 D14 items).

Those are not gaps in finding the bugs — they're gaps in proving production-readiness operationally. CLAUDE.md's "12 D14 operational items" runbook (`docs/runbooks/launch-cutover.md`) handles them.

## When `v1.0.0-launch-ready` can be tagged

- All 8 P0 dispatches landed + green E2E flow + evidence bundle uploaded.
- F#3 + F#4 baseline capture sessions complete.
- F#10 final attorney-reviewed disclaimer wording in production.
- All 12 D14 operational items signed off (NPC DPO registration, BIR ATP, PayMongo live mode, S3 Object Lock, Postgres PITR, DNS+TLS, ...).
- All 5 CI gates green at the commit.
- Test suite green at the commit (with the new harness running).
- `.test-evidence/` artifacts attached to the launch commit.

That is the deliverable Ken's brief asked for. The audit is the input to the dispatch list. The dispatch list (Phase I-B) is the runbook. The harness (Phase I-A) is the proof mechanism. Together they get the platform from "passable as a prototype" to "usable by real customers, real providers, real admins in the real world."

End of audit.
