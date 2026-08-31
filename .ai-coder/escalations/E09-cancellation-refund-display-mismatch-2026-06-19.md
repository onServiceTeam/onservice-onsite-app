# E09 — Cancellation refund: what customers are shown is not what they are refunded

**Date:** 2026-06-19
**Raised by:** AI coder (verifying handbook finding F1 at Ken's request)
**Severity:** HIGH — money path + customer representation. Not a crash, but customers
are shown cancellation terms that differ from the refund they actually receive, and the
admin "Cancellation Policy" editor does not control the real refund.
**Status:** OPEN — needs Ken's decision before any code change (money path).

## What I found (verified in code)

There are two separate cancellation-refund systems with two different data sources.

### System A — the REAL refund the customer receives
- Path: customer/admin cancels -> `booking.routes.ts:621` / `:1291` (and
  `booking-admin.service.ts:894`) call `escrowService.handleCancellation(...)` ->
  `commissionService.calculateCancellationRefund(...)`
  ([commission.service.ts:72](packages/api/src/services/commission.service.ts)).
- Source of numbers: `platform_settings` rows `cancel_refund_*`, read by
  `settingsService.getSettingNumber`. Defaults
  ([settings.service.ts:87](packages/api/src/services/settings.service.ts), seeded by
  migration 050):

  | hoursUntilScheduled | refund |
  |---|---|
  | >= 24h | 100% |
  | 2 to 24h | 100% |
  | 1 to 2h | 90% |
  | 30min to 1h | 80% |
  | under 30min | 70% |
  | provider already arrived | 50% |
  | customer no-show | 0% |

  Refund base is `service_price`, and the service fee is refunded separately (full fee
  back unless customer no-show). Provider gets the non-refunded share as compensation.

### System B — what the customer is SHOWN, and what the admin editor edits
- Path: the public cancellation-policy endpoint and the admin "Cancellation Policy"
  page (`cancellation-policy-public.routes.ts`, `cancellation-policy-admin.routes.ts`)
  read/write the `cancellation_policies` table (migration 071) via
  `pricing/cancellation.service.ts` `getActivePolicy()`.
- Seeded tiers (migration 071):

  | label | refund |
  |---|---|
  | 24+ hours before | 100% |
  | 4-24 hours before | 75% |
  | under 4 hours | 50% |
  | after scheduled / no-show | 0% |

- **`calculateCancellation()` in that service (the System-B refund math) is dead code.
  A repo-wide search finds it is never called.** So the `cancellation_policies` table
  is display-only. Editing the admin "Cancellation Policy" page changes what customers
  read but has zero effect on the money.

## Why it matters

1. **Customers are told one thing and refunded another.** Example: a customer who
   cancels 5 hours before is shown "4-24 hours = 75%" but is actually refunded 100%.
   A customer who cancels 1.5 hours before is shown "under 4 hours = 50%" but is
   actually refunded 90%. In the default seed System A is more generous than the
   displayed policy, so customers are not being underpaid today, but the displayed
   policy is still a false representation (a consumer-protection risk under RA 7394).
2. **The admin policy editor is a placebo.** A non-engineer admin who tightens the
   "Cancellation Policy" page to curb refund abuse changes nothing about real refunds.
   The real control is the Settings -> Cancellation `cancel_refund_*` rows, which are
   not obviously "the policy."
3. **The brackets do not even line up.** System A splits at 30min / 1h / 2h / 24h and
   has provider-arrived and customer-no-show cases; System B has a single 4h cliff and
   no provider-arrived case. They cannot be mapped one to one without a decision.

## Recommended fix (needs Ken)

Make ONE source of truth so what is shown equals what is paid, and so the admin editor
actually controls refunds.

- **Option 1 (recommended): the `cancellation_policies` table becomes canonical.** Wire
  the real refund computation (the escrow cancel path) to read the active policy tiers,
  so the admin "Cancellation Policy" page (which already has intro text, legal
  disclaimer, and labels) controls both the display and the money. Requires deciding how
  to represent the provider-arrived and customer-no-show cases and the service-fee
  refund inside the tier model, plus a migration to set the final agreed bracket values.
- **Option 2: the Settings `cancel_refund_*` rows become canonical.** Render the public
  policy page from those settings and retire the `cancellation_policies` table. Simpler
  money-wise, but the richer admin policy editor (intro/disclaimer/labels) is lost.

Either way, **Ken must decide the final bracket values** (this is a money + product
call), and the change touches the money path, so it lands on a topic branch + PR per the
operating-mode exception, not direct to master.

## What I am NOT doing
- Not changing any refund code or bracket value without Ken's decision.
- Until reconciled, support quotes the System A (actual) numbers, never the displayed
  page. This is already noted in `docs/operations/13-policies-codes-and-templates.md`.

## Operational containment added 2026-08-31

The mismatch is still unresolved. The admin audit found that the Cancellation Policy
page continued to call System B "server-canonical" and claimed every server pricing
path consumed it. That statement was false and made the display-only editor unsafe.

Containment now keeps both systems read-only without changing either set of numbers or
the live refund calculation:

- admin and super-admin support staff can compare System A and System B in one page;
- the page identifies which source moves money and which source feeds Help and Terms;
- POST/PUT mutations to the versioned display policy return a 409 E09 hold;
- the seven live `cancel_refund_*` controls are marked held and reject edits;
- support instructions point staff to the case-specific server-calculated outcome.

This containment is not the E09 resolution. The source-of-truth and final bracket
decision above is still required before either mutation surface can reopen.
