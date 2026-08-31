# EXPECTED-FAILURES — Gate fragments currently failing on master

Per Dispatch 0 step 0.2.4 (initial creation) and Dispatch 03 (tiered-enforcement reconciliation). This file documents which gate fragments are expected to fail on the current `master` HEAD AND which dispatch addresses each. As dispatches land, fragments move from this file to "now passing." When this file is empty, the gate suite is fully green.

**Source of truth:** the machine-readable mode declaration is [`scripts/gates/MODES.json`](MODES.json). The aggregator (`run-gate-a.sh`) and the constitution gate (`c-constitution.sh`) read MODES.json to decide whether a failing fragment fails the gate. This file is the human-readable companion. **When you change a fragment's mode, update both files in the same PR.**

The Phase 14 design accepts these failures during Dispatches 01–13 because each is owned by a specific later dispatch. **REPORT-tier fragments log failures without blocking the gate**; after the dispatch that owns each fragment lands, that fragment is promoted to BLOCKING for all subsequent PRs (update `MODES.json` in that dispatch's closeout PR).

---

## Gate A fragments

### `a-cross-source-cancellation-policy.sh`
- **Expected to fail on master:** NO.
- **Reason:** Bug 1170/1198 removed hardcoded cancellation tiers from the
  customer clients, but E09 later proved that the live escrow refund path still
  reads separate `cancel_refund_*` settings. The fragment now truthfully guards
  customer-display tier drift and requires the E09 mutation hold on both the
  versioned display table and all seven live refund settings. It does not claim
  the customer display and money path have one source.
- **Status:** BLOCKING immediately on the D02 branch and going forward.

### `a-cross-source-brand-color.sh`
- **Expected to fail on master:** NO (resolved by D02 Part 2).
- **Reason:** Bug 1324 fixed — `apps/mobile/src/config/theme.ts` updated to
  the canonical Stitch primary `#003D9B` (and supporting values from `tokens.json`).
  Migration 146 supersedes migration 072 and updates the same
  `platform_settings` rows; admin edits them via the existing `/admin/settings`
  page. Mobile dynamic
  theme override is tracked in LAUNCH-LIMITATIONS.md §brand-color-mobile-runtime.
- **Status:** BLOCKING immediately on D02 Part 2 branch and going forward.

### `a-cross-source-routes.sh`
- **Expected to fail on master:** NO (resolved by D02 Part 4 for static
  quoted paths). The gate as currently written catches `router.push('...')`
  / `router.push("...")` only — backtick template strings (~35 dynamic
  routes that carry `${id}` etc.) are still in flight and tracked under
  LAUNCH-LIMITATIONS §routes-registry-template-strings. Migrating those
  requires `buildRoute()` adoption case-by-case (often coupled with query-
  param refactors) and is reasonably scheduled with D12 mobile-customer
  polish.
- **Status:** BLOCKING for static-path violations on D02 Part 4 onward.

### `a-cross-source-tier-criteria.sh`
- **Expected to fail on master:** UNKNOWN
- **Reason:** Bug 974/1247 — tier criteria possibly hardcoded in client. Needs initial scan.
- **Owning dispatch:** Dispatch 02.
- **Becomes BLOCKING:** after D02 PR merges.

### `a-cross-source-no-axios.sh`
- **Expected to fail on master:** NO (resolved by D01 admin half + D02 Part 5 mobile half).
- **Reason:** Bug 1271 fixed for clients — admin uses native fetch wrapper
  (D01 PR #7) and mobile uses native fetch wrapper (D02 Part 5).
  Server-to-server outbound HTTP (payment.service.ts, sms.service.ts hitting
  third-party APIs) was excluded from gate scope — server outbound is not
  the constitutional concern (which was about client bundle bloat + cookie
  semantics).
- **Status:** BLOCKING immediately on D02 Part 5 onward.

### `a-cross-source-no-emoji-icons.sh`
- **Expected to fail on master:** NO (resolved by the 2026-08-23 UX audit).
- **Reason:** The remaining production emoji iconography was replaced with the central Lucide vector set across customer, provider, staff, support, shared mobile UI, and the remaining admin pages. The scanner was also made fail-closed when its runtime is unavailable.
- **Status:** BLOCKING from the 2026-08-23 UX audit onward.

### `a-cross-source-no-google-maps-placeholder.sh`
- **Expected to fail on master:** YES
- **Reason:** Bug 1286 — `apps/mobile/app.json:41,67` contains `YOUR_GOOGLE_MAPS_API_KEY` literal.
- **Owning dispatch:** Dispatch 01 (deploy blockers).
- **Becomes BLOCKING:** after D01 PR merges.

### `a-cross-source-hashes-immutable.sh`
- **Expected to fail on master:** NO
- **Reason:** No `HASHES-CORRECTED.sha256` files exist yet to be modified. Gate is preventive.
- **Owning dispatch:** Currently passing.
- **Status:** BLOCKING immediately.

### `a-cross-source-no-client-money.sh`
- **Expected to fail on master:** NO (resolved by D05).
- **Reason:** Phase 14 D05 (2026-04-30) closed Bug 175/176/208/1132/261/266/269/320/322/417/1219/1230. Every customer-facing validator now uses the server-canonical pattern (clients send IDs and quantities; server resolves prices from DB via `services/booking/pricing.service.ts`, `promo.service.ts`, `from-quote.service.ts`, etc.). Documented exceptions: `adminWalletAdjustmentSchema`, `createAddonSchema`/`updateAddonSchema`, and `// gate-a-allowed:` inline markers for legitimate admin-defined money fields (e.g., `discountValue` in `createPromoCodeSchema`).
- **Status:** BLOCKING immediately on the D05 branch and going forward.

### `a-cross-source-no-siguradoshield.sh`
- **Expected to fail on master:** NO (resolved by D04).
- **Reason:** Phase 14 D04 (Ken's Option A pull, 2026-04-30) removed SiguradoShield from all customer mobile surfaces, server config, and settings defaults. Old REPORT-only fragment is now a thin alias delegating to the stricter `c-constitution-no-shield-references.sh` (Gate C BLOCKING article).
- **Status:** BLOCKING immediately on D04 branch and going forward.

---

## Gate B (bug-deferral)

- **Expected to fail on master:** N/A
- **Reason:** Gate B operates per-dispatch by parsing `D<NN>-closeout.md`. It is invoked only when a dispatch branch with a closeout is being PR'd. Until D01's PR opens, Gate B has no input.
- **Status:** Passive; activates with first dispatch.

---

## Gate C (constitution)

### Article 4.2 — no `console.*` in production
- **Expected to fail on master:** UNKNOWN, likely some violations.
- **Owning dispatch:** Dispatches 01-12 progressively clean each affected file. Dispatch 11/12 (mobile polish) finishes.
- **Becomes BLOCKING:** after D12 PR merges.

### Article 4.6 — no emoji as iconography
- See `a-cross-source-no-emoji-icons.sh` above. The redundant constitution article is also BLOCKING from the 2026-08-23 UX audit onward.

### Article 7.1 — no axios
- See `a-cross-source-no-axios.sh` above.

### Article 12 — BIGINT money tests exist
- **Expected to fail on master:** NO
- **Reason:** `bigint-money-precision.test.ts` exists (created in Phase 13 Dispatch E with 5+ tests).
- **Status:** BLOCKING immediately. Verify via `find packages/api -name bigint-money-precision.test.ts`.

### Article 16 — closeout file exists for current dispatch
- **Expected to fail on master:** N/A on master itself; activates per branch.
- **Status:** BLOCKING per dispatch branch.

### Money-in-transaction
- **Expected to fail on master:** NO (resolved by D06).
- **Reason:** Phase 14 D06 (2026-04-30) closed Bugs 69, 70, 71, 78, 79, 80, 82, 83, 84, 85, 105, 106, 127, 237. Every money/audit mutation either composes via a trx-aware `*InTransaction` helper (releaseEscrowInTransaction, refundFromEscrowInTransaction, handleCancellationInTransaction, resolveDisputeInTransaction) or is annotated `// gate-c-allowed: best-effort-audit-only` for the documented non-blocking audit pattern (try/catch + logger.warn so audit failures don't roll back durable underlying state). Two real adjacent bugs were also fixed inline: `dispute.service.assignDispute` and `payout.service.approvePayout`. The gate logic itself was rewritten in D06 — the prior Kysely-pattern regex was vacuously passing because the codebase uses raw pg; the new awk pattern detects `db.query` calls with INSERT INTO admin_actions/wallet_transactions or UPDATE wallets at the top level (not inside `db.transaction`).
- **Status:** BLOCKING immediately on D06 branch and going forward.

---

## Gate D (visual screenshots)

- **Expected to fail on master:** YES (no baselines exist yet).
- **Reason:** No Playwright tests in `apps/admin/tests/visual/` and no Maestro flows in `apps/mobile/.maestro/visual/` yet.
- **Owning dispatches:** Dispatch 07 (admin Playwright + designer-grade restyle), Dispatch 08 (mobile Maestro), Dispatches 11/12 add per-screen baselines.
- **Becomes BLOCKING:** after D12 PR merges.

---

## Gate E (mutation testing)

- **Expected to fail on master:** UNKNOWN. Phase 13 reported 99.3% on partial run (1022/2237 mutants).
- **Reason:** Stryker not installed yet in `packages/api/node_modules`. After Dispatch 0 step 0.7.1 runs `pnpm install` for stryker packages, an initial baseline run is required (hours).
- **Owning dispatch:** Dispatch 0 step 0.7 establishes baseline. Dispatch 12 promotes from REPORT to BLOCKING.
- **Becomes BLOCKING:** after D12 PR merges.

---

## Mode timeline summary

| Dispatch landing | Fragments promoted to BLOCKING |
|---|---|
| D01 | a-cross-source-no-google-maps-placeholder, a-cross-source-no-axios (admin only) |
| D02 | a-cross-source-cancellation-policy, a-cross-source-brand-color, a-cross-source-routes, a-cross-source-tier-criteria, a-cross-source-no-axios (mobile complete) |
| D04 | a-cross-source-no-siguradoshield (now alias) + new BLOCKING gate_c_articles.no-shield-references |
| D05 | a-cross-source-no-client-money — promoted 2026-04-30 |
| D06 | money-in-transaction in c-constitution.sh — promoted 2026-04-30 |
| D07/D08 | Visual baselines for admin + mobile populated |
| D11/D12 | a-cross-source-no-emoji-icons, console.* in c-constitution.sh, full Gate D + Gate E BLOCKING |
| D13/D14 | All gates BLOCKING in CI; v1.0.0-launch-ready tag |

This file is updated by each dispatch's closeout to mark which fragments moved from "expected to fail" to "now passing."
