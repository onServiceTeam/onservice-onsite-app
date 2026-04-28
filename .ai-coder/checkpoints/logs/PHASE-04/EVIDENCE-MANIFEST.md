# Evidence Manifest — Phase 04 (Admin Dashboard)

**Branch**: `phase/04-admin-dashboard`
**Baseline commit**: `02aeed394f1a93c4553c533be0ddd94d8bf46871` (Phase 03 head)
**Phase prompt**: `.ai-coder/phases/PHASE-04-admin-dashboard.md` — replace
the admin Dashboard page with a rich KPI / chart / alert / cities surface
backed by 6 new read-only analytics endpoints. NOT a sacred-file phase
(no money mutations).

This manifest enumerates every artifact produced this phase and the claim it
backs.

---

## Claims and Artifacts

| #  | Claim                                                                            | Artifact                                                                 |
|----|----------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| 1  | TypeScript compiles cleanly across api + admin + mobile (preflight).             | `logs/PHASE-04/preflight/typecheck-before.log`                          |
| 2  | ESLint shows 0 errors / 0 warnings on the entire workspace (preflight).          | `logs/PHASE-04/preflight/lint-before.log`                               |
| 3  | Phase baseline commit recorded for delta-aware gates.                            | `logs/PHASE-04/preflight/baseline-commit.txt`                           |
| 4  | Final typecheck (verify-master regen) shows 0 errors.                            | `logs/PHASE-04/gates/gate-1-typecheck.log`                              |
| 5  | Final lint (verify-master regen) shows 0 errors.                                 | `logs/PHASE-04/gates/gate-1-lint.log`                                   |
| 6  | Forbidden-patterns scan: 0 introduced this phase (baseline carried forward).     | `logs/PHASE-04/gates/gate-1-forbidden.log`                              |
| 7  | Emoji scan: absolute=0, introduced=0.                                            | `logs/PHASE-04/gates/gate-1-emoji.log`                                  |
| 8  | Phantom-test scan: 0 patterns detected.                                          | `logs/PHASE-04/gates/gate-1-phantom-tests.log`                          |
| 9  | Dependency graph stable.                                                         | `logs/PHASE-04/gates/gate-1-deps.log`                                   |
| 10 | All 513 jest tests pass across 25 suites (35 new tests added this phase).        | `logs/PHASE-04/gates/gate-2-alltests.log`                               |
| 11 | 9 paper-traces walking new runtime paths step-by-step.                           | `logs/PHASE-04/gates/gate-2-paper-trace-phase-04.md`                    |
| 12 | Boundary patterns A-F + risk-surface analysis.                                   | `logs/PHASE-04/gates/gate-2-boundaries-phase-04.md`                     |
| 13 | Pre-mortem with 5 incident scenarios.                                            | `logs/PHASE-04/gates/gate-3-premortem.md`                               |
| 14 | Future-bugs analysis (most-likely 2-week regression).                            | `logs/PHASE-04/gates/gate-3-future-bugs.md`                             |
| 15 | Mutation testing on money services — N-A this phase.                             | Skipped: `admin-analytics.service.ts` is not in the sacred-file allowlist. No money-service file was touched. Tests written regardless per active sub-directive. |
| 16 | Money-conservation gate output (no NaN/orphan ledger rows).                      | `logs/PHASE-04/gates/gate-5-money.log`                                  |
| 17 | Migration scan: no new migrations this phase.                                    | `logs/PHASE-04/gates/gate-5-migrations.log`                             |
| 18 | N+1 query scan: 0 introduced this phase (baseline carried forward).              | `logs/PHASE-04/gates/gate-5-n-plus-1.log`                               |
| 19 | Check INDEX listing every Gate ID with PASS/N-A status.                          | `logs/PHASE-04/checks/INDEX.md`                                         |
| 20 | Honesty check disclosing every shortcut, deferral, and limitation.               | `logs/PHASE-04/HONESTY-CHECK.md`                                        |
| 21 | Sanity log — timestamped after-every-change ritual.                              | `logs/PHASE-04/sanity-checks.log`                                       |
| 22 | Cryptographic hash chain over every artifact.                                    | `logs/PHASE-04/HASHES.sha256`                                           |
| 23 | Baseline-debt summary aggregating absolute counts of pre-existing violations.    | `logs/PHASE-04/BASELINE-DEBT.md`                                        |

---

## Deferred to later phases

- **Real `webhook_events` table** so the PayMongo webhook-failure alert can
  query a first-class source instead of `audit_log` text-pattern matching.
  See `HONESTY-CHECK.md` Q1 item 1.
- **Hysteresis for guarantee-fund alert** to prevent flicker when balance
  hovers near `burn*0.3`. See `gate-3-premortem.md` Incident 5.
- **Stale-while-revalidate snapshot** so the dashboard renders the
  last-known-good state during partial DB outages. See `HONESTY-CHECK.md`
  Q1 item 3.
- **Removal of legacy `GET /api/v1/admin/dashboard`** once consumer audit
  confirms migration to the new `/dashboard/kpis` endpoint.
- **Internal hardening of `getDashboardKpis(rawRange: unknown)`** to validate
  the range string at the service boundary (defense-in-depth). See
  `gate-3-future-bugs.md`.
- **Index `reviews(provider_id, created_at DESC)`** and/or materialized view
  for the consecutive-1-star alert query, before the reviews table grows
  past ~1M rows. See `gate-3-premortem.md` Incident 3.
- **Pre-existing baseline violations** (forbidden-patterns, N+1 patterns)
  carried forward — see `BASELINE-DEBT.md`.

---

## Self-attestation

I have reviewed every artifact listed above. Each path resolves to a file
generated during this phase's session. The Claims column accurately describes
what each artifact proves. I have separately answered the four honesty
questions in `HONESTY-CHECK.md` and disclosed every known limitation,
shortcut, and deferral.

I attest the above is true.
