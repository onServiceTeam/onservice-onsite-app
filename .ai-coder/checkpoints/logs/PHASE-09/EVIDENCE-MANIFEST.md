# Phase 09 — Evidence Manifest (Missing Stitch Screens + Marketing Admin)

## Claims and Artifacts

| #  | Claim                                                                                  | Artifact                                                                 |
|----|----------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| 1  | Final typecheck (verify-master regen) shows 0 errors.                                  | `logs/PHASE-09/gates/gate-1-typecheck.log`                              |
| 2  | Final lint (verify-master regen) shows 0 errors.                                       | `logs/PHASE-09/gates/gate-1-lint.log`                                   |
| 3  | Forbidden-patterns scan: 0 introduced this phase.                                      | `logs/PHASE-09/gates/gate-1-forbidden.log`                              |
| 4  | Emoji scan: 0 introduced this phase.                                                   | `logs/PHASE-09/gates/gate-1-emoji.log`                                  |
| 5  | Phantom-test scan: 0 patterns detected.                                                | `logs/PHASE-09/gates/gate-1-phantom-tests.log`                          |
| 6  | Dependency graph stable (no new deps).                                                 | `logs/PHASE-09/gates/gate-1-deps.log`                                   |
| 7  | All 735 jest tests pass (33 new this phase: marketing-admin.test.ts).                  | `logs/PHASE-09/gates/gate-2-alltests.log`                               |
| 8  | Paper-trace walking each new money / data path.                                        | `logs/PHASE-09/gates/gate-2-paper-trace-phase-09.md`                    |
| 9  | Boundary tests for every new exported function (11 marketing-admin exports + 10 routes + 8 mobile screens). | `logs/PHASE-09/gates/gate-2-boundaries-phase-09.md`        |
| 10 | Pre-mortem with 9 incident scenarios.                                                  | `logs/PHASE-09/gates/gate-3-premortem.md`                               |
| 11 | Future-bugs analysis (11 known limitations / TODOs).                                   | `logs/PHASE-09/gates/gate-3-future-bugs.md`                             |
| 12 | Mutation testing carried by Stryker via verify-master against sacred-file allowlist.   | `logs/PHASE-09/gates/gate-3-mutations.log`                              |
| 13 | Money-conservation gate: marketing-admin writes NO money to bookings/escrow; only campaign budget tracking. | `logs/PHASE-09/gates/gate-5-money.log`                |
| 14 | Migration scan: one new migration (056, additive tables only — no admin_actions CHECK widening). | `logs/PHASE-09/gates/gate-5-migrations.log`                    |
| 15 | N+1 query scan: 0 introduced this phase.                                               | `logs/PHASE-09/gates/gate-5-n-plus-1.log`                               |
| 16 | Migration 056 — promo_codes + marketing_campaigns schema (42 lines).                   | `packages/api/migrations/056_marketing_promos_campaigns.sql`            |
| 17 | Marketing admin service — promo + campaign CRUD + overview (710 lines, 11 exports).    | `packages/api/src/services/marketing-admin.service.ts`                  |
| 18 | Express routes for /api/v1/admin/marketing (255 lines, 10 endpoints).                  | `packages/api/src/routes/marketing-admin.routes.ts`                     |
| 19 | server.ts wires marketing router BEFORE the generic /api/v1/admin mount (1 import + 1 mount line). | `packages/api/src/server.ts`                                |
| 20 | 33 Jest unit tests covering every validation branch + audit literals + CPA/ROI math (439 lines). | `packages/api/__tests__/marketing-admin.test.ts`              |
| 21 | Frontend MarketingPage — 3 tabs Overview / Promos / Campaigns (1222 lines).            | `apps/admin/src/pages/MarketingPage.tsx`                                |
| 22 | App.tsx adds lazy import + Route /marketing (2-line addition).                         | `apps/admin/src/App.tsx`                                                |
| 23 | Mobile screen — provider identity verification 5-step wizard (515 lines).              | `apps/mobile/app/provider-onboarding/identity-verification.tsx`         |
| 24 | Mobile screen — provider background-check status with refresh (313 lines).             | `apps/mobile/app/provider-onboarding/background-check-status.tsx`       |
| 25 | Mobile screen — customer payment-failed error state with countdown (165 lines).        | `apps/mobile/app/customer/booking/payment-failed.tsx`                   |
| 26 | Mobile screen — provider job navigation deep-links to Maps/Waze (232 lines).           | `apps/mobile/app/provider/job/[id]/navigate.tsx`                        |
| 27 | Mobile screen — provider job sectioned checklist with photo + report-issue (444 lines, REPLACED prior stub per spec). | `apps/mobile/app/provider/job/[id]/checklist.tsx` |
| 28 | Mobile screen — provider mark-complete: 4 photos + signature + notes (349 lines).      | `apps/mobile/app/provider/job/[id]/complete.tsx`                        |
| 29 | Mobile screen — provider editable service area with map + radius (256 lines).          | `apps/mobile/app/provider/service-area.tsx`                             |
| 30 | Mobile screen — provider skills/categories management (397 lines).                     | `apps/mobile/app/provider/skills.tsx`                                   |
| 31 | Honesty check disclosing every shortcut, deferral, and limitation.                     | `logs/PHASE-09/HONESTY-CHECK.md`                                        |
| 32 | Sanity log (after-every-change ritual).                                                | `logs/PHASE-09/sanity-checks.log`                                       |
| 33 | Check INDEX listing every Gate ID with PASS status.                                    | `logs/PHASE-09/checks/INDEX.md`                                         |
| 34 | Cryptographic hash chain over every artifact (regen by verify-master).                 | `logs/PHASE-09/HASHES.sha256`                                           |
| 35 | Preflight baseline commit captured before phase start.                                 | `logs/PHASE-09/preflight/baseline-commit.txt`                           |
| 36 | Preflight typecheck baseline captured.                                                 | `logs/PHASE-09/preflight/typecheck-before.log`                          |
| 37 | Preflight lint baseline captured.                                                      | `logs/PHASE-09/preflight/lint-before.log`                               |

---

## Deferred to later phases

- **Promo redemption integration in checkout** — schema + admin CRUD shipped; mobile checkout screen does NOT yet read or apply promos. See future-bugs #1.
- **`promo_redemptions` table for per-customer usage limit enforcement** — schema reserves `usage_limit_per_customer` but no redemption ledger yet. See future-bugs #2.
- **Auto-attribution of campaign signups** — manual entry only; no `referrer_code` cookie/UTM capture. See future-bugs #3.
- **Background check service backend** — UI is hooked to a stub; no `nbi_clearances` table yet. See future-bugs #4.
- **Identity ID server-side blur/glare detection** — only a client-side 8MB size check today. See future-bugs #5.
- **`/api/v1/providers/me/{skills,service-area}` endpoints** — assumed present; mobile screens fail gracefully with Alert if missing. See future-bugs #6.
- **`/api/v1/bookings/:id/{arrived,issues,complete}` endpoints** — same assumption. See future-bugs #7.
- **Live chat support, password_reset (web), change_phone_number, linked_accounts (OAuth) screens** — Batch 09d items deferred per spec. See future-bugs #9-10.
- **Campaign date-range filter** does NOT pro-rate spend across days; matches campaigns by `started_at` within window only. See future-bugs #11.

---

## Self-attestation

I, the agent, attest that I have reviewed every artifact listed above.
Each path resolves to a file generated during this phase's session.
The Claims column accurately describes what each artifact proves. I
have separately disclosed every known limitation, shortcut, and
deferral in `HONESTY-CHECK.md` and `gates/gate-3-future-bugs.md`. All
artifacts above exist and were verified by tsc/eslint/jest/build at
HEAD of `phase/09-missing-stitch-screens`.

I attest the above is true.
