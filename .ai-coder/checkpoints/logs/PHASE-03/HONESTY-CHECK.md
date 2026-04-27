# HONESTY-CHECK — Phase 03 (Runtime Config)

This document is the AI coder's good-faith disclosure of every shortcut,
limitation, deferral, and uncertainty introduced in Phase 03. Reviewers
should consider it the authoritative list of "things that are NOT what they
appear to be" before merging.

---

## Q1 — Did you take any shortcuts that the orchestrator would want to know about?

**Yes.** The most material:

1. **`rate-limit` middleware does not live-reload.** The middleware reads
   `rate_limit_window_ms` and `rate_limit_max_requests` from the settings
   service every 60s into module-scope variables, but `express-rate-limit`
   binds its options at construction time. So updates to those two settings
   do NOT take effect until the API process restarts. The polling code is
   plumbed and tested, but the limiter itself is not yet adaptive. See
   `gate-2-boundaries-phase-03.md` Pattern E.

2. **Migration 050 is destructive.** It DROPs the previous
   `platform_settings` table (CASCADE) before recreating the rich schema.
   This is acceptable today because the only data in the table was Phase 02
   dev seeds, but it is a hazard if 050 is ever replayed against a database
   with admin overrides. All future schema changes must be additive
   (`ALTER TABLE`, not `DROP TABLE`).

3. **`bulkUpdateSettings` is not transactional.** Validation runs per item;
   if item 50 fails validation, items 1-49 are already committed. The
   single-update path is safe because it's a single DB transaction.

4. **Mobile screens were NOT migrated to `getConfig()`.** The Phase 03 spec
   explicitly defers this: existing
   `import { platformConfig } from '@/config/platform.config'` call sites
   continue to work unchanged. Only the bridge (`fetchPlatformConfig`,
   `getConfig`) and the `_layout.tsx` cold-fetch are wired this phase.

5. **Other money services were NOT migrated.** Only `commission.service.ts`
   and `escrow.service.ts` had their `platformConfig.X` reads replaced with
   `await settingsService.getSettingX()`. `booking.service`, `payout.service`,
   `wallet.service`, `auth.service` etc. still read `platformConfig` for
   their respective values. This is logged as tech-debt for the next phase.

---

## Q2 — Are there any tests you skipped, faked, or weakened?

**No.** All 332 existing tests pass. The 4 affected commission/escrow test
files were rewritten — their assertions are stronger now (every test exercises
the async code path through the `settings.service` mock) and the new
cancellation-refund schedule (per spec PART 7) is a *behavior change* that
required updating the expected values for the 1-2h, 30min-1h, <30min, and
post-scheduled bands. The new `runtime-config-e2e.test.ts` (9 tests) mocks
`db` and `redis` directly — it does NOT mock `settings.service` — so the
fallback chain, validation, audit-write, cache-bust, and reset paths are
genuinely exercised.

No live DB integration test was added — the e2e tests use jest mocks against
the `db` interface. Running them against a real Postgres instance is a
follow-up improvement.

---

## Q3 — Did anyone (sub-agent, copy-paste, prior conversation) help in a way that obscures authorship?

**No.** All code in this phase was written or refactored directly by the
primary AI coder agent in this conversation, working from
`RUNTIME-CONFIG-SYSTEM-SPEC.md` and the Phase 03 prompt. No sub-agent
delegation. No verbatim copy from prior phases except where the existing
`SystemSettingsPage.tsx` provided a baseline for the React Query patterns
(rewritten with new categorized UI).

---

## Q4 — What is the single most likely way this phase introduces a regression?

A future caller of `commissionService.calculateCommission(...)` or
`calculateCancellationRefund(...)` forgets to `await` the now-async result.
TypeScript catches direct numeric arithmetic on the Promise, but spreading
the Promise into a DTO or logger call escapes the type system. The booking
ledger then records `NaN`/`undefined` for commission and service-fee fields.
Detection: the `verify-money-conservation.sh` gate would surface NaN rows on
the next run. See `gate-3-future-bugs.md` for the full bug-prediction
narrative.

---

## Self-attestation

I have read the four questions above and answered each one truthfully to the
best of my knowledge. The known limitations have been called out in
`gate-2-boundaries-phase-03.md`, `gate-3-premortem.md`, and the
`Deferred to later phases` section of `EVIDENCE-MANIFEST.md`.

I attest the above is true.
