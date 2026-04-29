# EXPECTED-FAILURES — Gate fragments currently failing on master

Per Dispatch 0 step 0.2.4. This file documents which gate fragments are expected to fail on the current `master` HEAD AND which dispatch addresses each. As dispatches land, fragments move from this file to "now passing." When this file is empty, the gate suite is fully green.

The Phase 14 design accepts these failures during Dispatches 01-13 because each is owned by a specific later dispatch. **The CI workflow runs the gates in REPORT mode initially (logs failures without blocking)**; after the dispatch that owns each fragment lands, that fragment moves to BLOCKING mode for all subsequent PRs.

---

## Gate A fragments

### `a-cross-source-cancellation-policy.sh`
- **Expected to fail on master:** NO (resolved by D02 cancellation work).
- **Reason:** Bug 1170/1198 fixed — `cancellation_policies` table is now the
  single source of truth (admin-editable via /admin/settings/cancellation-policy).
  Mobile `terms.tsx` and `help.tsx` consume `/api/v1/settings/cancellation-policy`.
  Static `cancellationFees` / `cancellationRefundSplits` deleted from
  `platform.config.ts` (api + mobile). Gate now passes locally.
- **Status:** BLOCKING immediately on the D02 branch and going forward.

### `a-cross-source-brand-color.sh`
- **Expected to fail on master:** YES
- **Reason:** Bug 1324 — `#0066FF` and `#0F62FE` referenced in mobile `theme.ts` and admin `Chart.tsx`. Canonical `#1B3A4B` from `tokens.json` not yet enforced.
- **Owning dispatch:** Dispatch 02.
- **Becomes BLOCKING:** after D02 PR merges.

### `a-cross-source-routes.sh`
- **Expected to fail on master:** YES
- **Reason:** Bug 1185 — ~70% of mobile screens use raw path strings instead of `Routes` registry constants.
- **Owning dispatch:** Dispatch 02.
- **Becomes BLOCKING:** after D02 PR merges.

### `a-cross-source-tier-criteria.sh`
- **Expected to fail on master:** UNKNOWN
- **Reason:** Bug 974/1247 — tier criteria possibly hardcoded in client. Needs initial scan.
- **Owning dispatch:** Dispatch 02.
- **Becomes BLOCKING:** after D02 PR merges.

### `a-cross-source-no-axios.sh`
- **Expected to fail on master:** YES
- **Reason:** Bug 1271 — `axios` imports in `apps/mobile/src/services/api.ts` and `apps/admin/src/lib/api.ts`. Constitution Article 7.1 forbids axios.
- **Owning dispatch:** Dispatch 01 fixes the admin (httpOnly cookies + fetch wrapper); Dispatch 02 finishes mobile.
- **Becomes BLOCKING:** after D02 PR merges.

### `a-cross-source-no-emoji-icons.sh`
- **Expected to fail on master:** YES
- **Reason:** Phase 13's `BASELINE-DEBT.md` claims `gate-1-emoji: absolute=0, introduced-this-phase=0` but a fresh run during Phase 14 bootstrap shows `absolute=1089, introduced-this-phase=412`. Emoji icons exist throughout `apps/mobile/src/config/accessibility.ts:56-63`, mobile dashboard cards, admin sidebar, etc.
- **Owning dispatch:** Dispatch 02 (initial reconciliation), Dispatches 07/08/11/12 (per-screen polish replaces all emoji with lucide).
- **Becomes BLOCKING:** after D12 PR merges.

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
- **Expected to fail on master:** YES
- **Reason:** Bug 175/176/208/261 — server validators accept money fields (`servicePrice`, addon `price`, etc.) from clients.
- **Owning dispatch:** Dispatch 05 (Money trust closure).
- **Becomes BLOCKING:** after D05 PR merges.

### `a-cross-source-no-siguradoshield.sh`
- **Expected to fail on master:** YES
- **Reason:** Bug 538 — SiguradoShield references in 6 mobile customer surfaces plus `platform.config.ts:54-57` constants.
- **Owning dispatch:** Dispatch 04 (SiguradoShield Option A pull).
- **Becomes BLOCKING:** after D04 PR merges.

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
- See `a-cross-source-no-emoji-icons.sh` above.

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
- **Expected to fail on master:** YES
- **Reason:** Bugs 69, 70, 71, 78, 79, 80, 82, 83, 84, 85, 105, 106, 127, 237 — 14 services have money mutations outside `db.transaction()`.
- **Owning dispatch:** Dispatch 06 (Transactional audit completeness).
- **Becomes BLOCKING:** after D06 PR merges.

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
| D04 | a-cross-source-no-siguradoshield |
| D05 | a-cross-source-no-client-money |
| D06 | Money-in-transaction in c-constitution.sh |
| D07/D08 | Visual baselines for admin + mobile populated |
| D11/D12 | a-cross-source-no-emoji-icons, console.* in c-constitution.sh, full Gate D + Gate E BLOCKING |
| D13/D14 | All gates BLOCKING in CI; v1.0.0-launch-ready tag |

This file is updated by each dispatch's closeout to mark which fragments moved from "expected to fail" to "now passing."
