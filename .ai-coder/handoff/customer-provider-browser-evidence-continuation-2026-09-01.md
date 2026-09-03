# Customer and provider browser evidence continuation, 2026-09-01

## Scope completed

The customer, provider-owner, provider-staff, shared-support, and provider
application browser matrices were regenerated against a clean Expo production
web export at 768, 1024, and 1366 CSS pixels.

| Evidence set | Result |
| --- | ---: |
| Customer populated routes | 144 / 144 |
| Customer forced API failure routes | 144 / 144 |
| Customer fixed-price booking journeys | 3 / 3 |
| Customer custom-quote journeys | 3 / 3 |
| Provider and staff populated routes | 159 / 159 |
| Provider and staff forced API failure routes | 159 / 159 |
| Provider application screen checks | 27 / 27 |

Every matrix finished with zero recorded failures. Populated-state checks fail
on an unmatched API request, missing expected marker, wrong path, global error
boundary, page error, unexpected console error, or horizontal overflow.
Forced-failure checks deliberately return 503 for application sources and fail
on a blank document, crash boundary, browser error, or overflow.

## Harness corrections

`browser-audit-clock.mjs` is the shared source for the fixed audit clock,
Chromium rendering flags, reduced-motion context, screenshot settings, and
the network/font/animation settle step. The Date proxy pins `Date.now()` and
zero-argument Date construction while leaving timers operational.

All seven customer/provider runners install that clock. All visual runners now
use the shared settle and rendering settings. The provider populated fixture
also implements the current response contracts for:

- `GET /api/v1/providers/me/commission-preview`
- `GET /api/v1/providers/me/job-requests/:bookingId`

The earlier generic responses were stale and could make a correct screen look
broken or hide a contract mismatch.

## Evidence locations

- `.ai-coder/checkpoints/logs/customer-browser-audit-2026-08-31/`
- `.ai-coder/checkpoints/logs/provider-browser-audit-2026-08-31/`

The JSON reports are machine-readable. Provider populated and onboarding
contact sheets were regenerated after the final runs.

## Raw-pixel repeat finding

A focused repeat captured provider Job Detail and Complete Job at all three
widths. Five of six images were byte-identical. The sixth differed in 57 of
691,200 pixels, with one-value RGB changes along rounded card edges. The
machine-readable route, body text, expected marker, API coverage, and overflow
report were unchanged. Treat exact PNG equality as too strict for those
anti-aliased edges; do not treat that renderer noise as a product defect or
silently mask meaningful screen regions.

## Production boundary

This is local repository/browser evidence only. Production was not changed.
E32 still blocks trusted SSH access, and E50 still requires inventory and
reconciliation of paid, held, or unreleased production bookings before any
money-semantics merge or deployment. The branch must not be merged or deployed
until those holds are resolved.

## Next work

Continue with the suspicion-first admin operator audit. Trace each control and
field to the server-owned customer, provider, booking, payment, support,
conversation, dispute, compliance, and audit record. Existing admin UI is
implementation evidence, not proof that the operating model is correct.
