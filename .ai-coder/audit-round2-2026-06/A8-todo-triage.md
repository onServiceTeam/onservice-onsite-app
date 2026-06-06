# A8 — dead folders deleted + TODO/FIXME/HACK triage

**Date:** 2026-06-06

## (1) Dead `store/` folders — DELETED

Confirmed both held only a `.gitkeep` and nothing imports them (every real
import points at `stores/` plural — verified by grep across `apps/`):

- `apps/mobile/src/store/` — deleted (real code is in `apps/mobile/src/stores/`)
- `apps/admin/src/store/` — deleted (real code is in `apps/admin/src/stores/`)

Build/typecheck/tests still pass after removal.

## (2) TODO / FIXME / HACK triage (production source only)

A repo-wide scan of `.ts`/`.tsx` shows the audit's "~29 markers" figure was
mostly **test files referencing past TODOs** (e.g. tests that assert a TODO
string is GONE) and CI-guard comments — not live code debt. The actual
production-source markers are:

| # | File:line | Marker | Recommendation |
|---|---|---|---|
| 1 | `packages/api/src/services/booking/pricing.service.ts:138` | `TODO(d05-subtask-4): replace with resolveSurgeRule()` | **Ticket (low priority).** Functional today — surge is computed via `resolveSurgeLegacy()` from the older `services/pricing.service.ts`. The TODO is a refactor to the newer `services/booking/surge.service.ts`. No behavior bug; clean-up only. |
| 2 | `apps/mobile/app/customer/safety-and-support.tsx:22` | `TODO: Ken to provide explicit no-insurance disclaimer wording` | **Ken / attorney (already tracked).** This is the F#10 legal-disclaimer item — interim wording is live + CI-guarded (see `.ai-coder/decisions/D14r-10-legal-disclaimer.md`). Not a code fix. |
| 3 | `apps/mobile/app/customer/terms.tsx:65` | (comment) "do not reintroduce a TODO placeholder (CI-guarded)" | **No action.** Not a TODO — a guard note reminding future edits not to ship a placeholder. The CI gate enforces it. |

**Test-file references (no action — they assert a TODO is absent or document a
prior one):** `apps/admin/src/pages/__tests__/bug-phase98-01-compliance-tax-tab.test.ts`,
`packages/api/__tests__/bug-phase131-01-booking-offer-city-from-row.test.ts`,
`apps/mobile/__tests__/proof/phone-validation.real.test.ts`.

**Net:** one real (low-priority) refactor TODO to ticket, one item that is
already Ken/attorney-tracked (F#10), nothing requiring an immediate code fix.
Per the instruction, none were auto-fixed.
