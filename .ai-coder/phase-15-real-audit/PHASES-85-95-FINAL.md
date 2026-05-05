# Phases 85–95 — Continuation deep audit pass (2026-05-05, part 2)

Eleven phases continuing the screen-by-screen audit started in Phases
17–84. Same recipe: read full source, identify gaps, fix narrowly, verify
with tsc + jest, commit atomically with co-author attribution. Phase 87
surfaced a launch-blocker regression that needs Ken's call — escalation
file `.ai-coder/escalations/E03-customer-checkout-state-machine-2026-05-05.md`.

## Real bugs found and fixed

### BUG-PHASE85-01 — Customer recurring screens missing enriched fields

**Files:** `packages/api/src/services/recurring.service.ts`,
`packages/api/__tests__/bug-phase85-01-recurring-enrichment.test.ts`

The customer recurring list (`apps/mobile/app/customer/recurring/index.tsx`)
and detail (`apps/mobile/app/customer/recurring/[id].tsx`) screens read
fields the backend never returned:

- `categoryName`, `subcategoryName` (the title row)
- `nextScheduledDate` (the "Next: …" row + Skip Next button gate)
- `totalCompleted`, `totalSkipped` (the counters)
- `providerName` (detail screen)

The backend's `getCustomerRecurringBookings` and `getRecurringBooking`
both did `SELECT * FROM recurring_bookings`, and `formatRecurringBooking`
mapped scalar columns only.

User-visible breakage pre-fix:

- Title row blank (subcategoryName ?? categoryName both undefined).
- "Next: …" row never appeared on either screen.
- Skip Next button never showed (gated on nextScheduledDate truthiness).
- "Completed" / "Skipped" counters showed undefined.
- Provider name never appeared on the detail screen.

**Fix:** Shared `RECURRING_SELECT_WITH_JOINS` preamble used by both
detail-by-id and customer-list queries. JOINs `service_categories`,
`service_subcategories`, `providers`, `users`, and aggregates
`recurring_instances` counts (completed via `b.status='completed'`,
skipped via `ri.status='skipped'`). `formatRecurringBooking` exposes the
new fields plus `nextScheduledDate` alias and `cancelReason` alias so the
mobile screens render correctly without a client-side rewrite.

**Test:** 7 assertions covering the SQL shape (table joins, aggregate
predicates, list query parity with detail) and formatter exposure
(present, fallbacks for missing data, alias mirrors).

### BUG-PHASE86-01 — Quote-accepted bookings stuck on payment_pending

**Files:** `apps/mobile/app/customer/booking/pay.tsx` (new),
`apps/mobile/app/customer/booking/[id].tsx`,
`apps/mobile/app/customer/booking/quotes.tsx`,
`apps/mobile/__tests__/bug-phase86-01-pay-existing-booking.test.ts`

When a customer accepted a quote on a quote-based booking, the server
moved booking.status to `payment_pending` and the mobile app routed to
`/customer/booking/[id]` (the booking detail). That screen had branches
for `ACTIVE_STATUSES`, `COMPLETED_STATUSES`, `CANCELLABLE_STATUSES`, and
`NEEDS_CONFIRMATION` but no `payment_pending` branch.

User-visible breakage pre-fix: after tapping "Accept Quote" the customer
saw only "Cancel Booking" and "Chat with Provider" — no path to actually
pay. The accepted quote could not be redeemed without re-creating the
booking from scratch (and the same provider may not re-quote).

**Fix:**

1. New screen `apps/mobile/app/customer/booking/pay.tsx` that takes a
   `bookingId`, fetches the booking, refuses non-payment_pending states,
   shows the receipt + payment-method picker, and calls
   `createPaymentIntent(bookingId, method)`. On wallet, the API debits
   + funds escrow synchronously; on gcash/maya/card/qrph, the returned
   `checkoutUrl` is opened via Linking. Same 5 channels as the
   new-booking checkout for parity.
2. Booking detail renders a "Complete Payment" button that routes to
   `/customer/booking/pay?bookingId=…` when `status === 'payment_pending'`.
3. Quotes accept-success now routes directly to `/pay` instead of the
   dead-end booking detail.

**Test:** 8 assertions covering the new screen's wiring (right service
calls, status guard, all 5 payment channels, checkout URL flow), the
booking detail's Complete Payment button gating, and the quotes accept
flow's new route + removal of the old dead-end.

### BUG-PHASE88-01 — Promotion ctaLink fails for external URLs

**Files:** `apps/mobile/app/(tabs)/home.tsx`,
`apps/mobile/__tests__/bug-phase88-01-promo-cta-link.test.ts`

`promotions.cta_link` (migration 044) is `VARCHAR(500)` with no format
constraint. Operators set it to either internal paths
(`/customer/category/cleaning`) or external URLs
(`https://onservice.ph/promo`). Pre-fix the home tab passed it straight
to `expo-router`'s `router.push`, which silently fails for external
URLs — the customer's tap on the promo CTA did nothing.

**Fix:** Route by shape. Internal paths (`startsWith('/')`) still go
through `router.push`; http/https URLs go through `Linking.openURL`;
anything else (malformed string, mailto:, tel:) is ignored — no crash,
no unintended external-protocol launch.

**Test:** 4 source-shape assertions covering import, both branches, and
absence of the pre-fix unconditional `router.push`.

### BUG-PHASE89-01 — Provider FAQ commission rates outdated

**Files:** `apps/mobile/app/provider/help.tsx`,
`apps/mobile/__tests__/bug-phase89-01-provider-faq-commission.test.ts`

The provider Help & Support FAQ described commission as ranges per tier
("8-15%", "10-12%", "8-10%") and omitted the Verified tier entirely.
Actual `platformConfig.commissionRates` are flat per tier:
founding=10%, new=15%, verified=13%, pro=11%, elite=9%. Providers
reading the FAQ expected rates to drift downward within a tier — they
don't, only crossing tiers changes the rate.

**Fix:** rewrote the answer to match the live config — flat rate per
tier, all five tiers (including founding as invite-only and verified),
with actual eligibility criteria.

**Test:** 4 source-shape assertions: pre-fix range strings absent,
"flat percent per tier" phrasing present, all 5 tiers + their actual
rates appear, founding flagged as invite-only.

### BUG-PHASE90-01 — Payment-failed countdown ignored booking creation time

**Files:** `apps/mobile/app/customer/booking/payment-failed.tsx`,
`apps/mobile/__tests__/bug-phase90-01-payment-failed-countdown.test.ts`

The countdown initialised secondsLeft to HOLD_SECONDS (72h) every time
the screen mounted. A booking created 5h earlier that hit
payment-failed at the retry step showed "72:00:00" remaining even
though the server-side `expireUnmatchedBookings` worker would cancel
it at created_at + 72h — leaving only ~67h.

**Fix:** useQuery `getBookingById` and re-seed secondsLeft from
`(createdAt + 72h - now())` clamped at 0. Pre-load fallback to
HOLD_SECONDS preserved.

**Test:** 4 source-shape assertions covering useQuery+getBookingById
imports, query keying/gating, the re-seed math, and the fallback.

### BUG-PHASE91-01 — Provider change-order form ignored server's 50% cap

**Files:** `apps/mobile/app/provider/job/[id]/change-order.tsx`,
`apps/mobile/__tests__/bug-phase91-01-change-order-50pct-cap.test.ts`

The form had no client-side knowledge of the 50% relative cap that
`booking.service.createChangeOrder` enforces (Phase 14 D05 Bug 1219).
The bottom note said "exceeding 50% may require admin approval." There
is no admin-override path — the API rejects amounts >50% outright.
Provider would enter 60%, wait through photo upload, then see a 400.

**Fix:** useQuery `getBookingById`; compute `fiftyPercentCap`; render
inline cap line under the amount input (red when exceeded); fold
`exceedsCap` into `isValid` so Submit blocks. Bottom-note copy
rewritten to match server behavior.

**Test:** 6 source-shape assertions covering the booking fetch, cap
derivation, isValid gate, removal of the misleading note, new copy,
red styling.

### BUG-PHASE92-01 — Provider payout account format mismatch

**Files:** `apps/mobile/app/provider/withdraw.tsx`,
`apps/mobile/app/provider/payout-settings.tsx`,
`apps/mobile/__tests__/bug-phase92-01-payout-account-normalization.test.ts`

The mobile screens showed placeholder "09XX XXX XXXX" but the server's
`payout.service.validateDestinationAccount` enforces strict regexes
that reject spaces (gcash/maya: `/^09\d{9}$/`, bank: `/^\d{8,16}$/`).
A provider copying the placeholder ("0917 555 1234") submitted, hit
HTTP 400, was confused.

**Fix:** Both screens add `normalizeAccount(raw)` that strips
non-digits via `replace(/\D+/g, '')` and submit the normalized value.
payout-settings.tsx also tightens the required-field gate from
`!account.trim()` to `normalizedAccount.length === 0`.

**Test:** 5 source-shape assertions: each screen defines normalizeAccount,
both submit normalized (not raw .trim()), payout-settings gate uses
normalized length.

### BUG-PHASE93-01 — Admin CatalogPage price float precision

**Files:** `apps/admin/src/pages/CatalogPage.tsx`,
`apps/admin/src/pages/__tests__/bug-phase93-01-catalog-price-rounding.test.ts`

Subcategory create/edit converted prices with `Number(x) * 100` and
sent the result raw. JS floating-point produces values like
`500.55 * 100 === 50055.00000000001`. service_subcategories.base_price
is INTEGER centavos (migration 003), so Postgres rejects the
non-integer parameter with "invalid input syntax for type integer".
Admins entering any price not on a 0.50 boundary saw an opaque error.

**Fix:** Extract `toCentavos(raw): number | null` that rounds to the
nearest centavo via `Math.round(n * 100)`. Returns null for
empty/non-finite input so quote-based subcategories submit cleanly.
All three price fields (basePrice, minPrice, maxPrice) route through it.

**Test:** 4 source-shape assertions: pre-fix raw `* 100` lines gone,
toCentavos exists with Math.round, empty/non-finite handling, all 3
price fields use the helper.

### BUG-PHASE94-01 — Founding tier missing from every mobile TIER_* map

**Files:** `apps/mobile/src/config/theme.ts`, four screens
+ `apps/mobile/__tests__/bug-phase94-01-founding-tier-everywhere.test.ts`

The founding tier (10% commission, invite-only launch batch — DECISION-003)
existed in `platformConfig.commissionRates` and `packages/api` TIER_LADDER,
but was MISSING from every mobile screen's TIER_COLORS / TIER_LABELS /
TIER_ICONS map. Five consumers fell through to `colors.textTertiary` (grey)
+ raw lowercase "founding" string.

**Fix:** New `tierFounding` token (#0E7C7B). Added to all 5 consumers:
provider dashboard, provider profile tab, customer provider detail,
customer search, provider tier-progression (also gets the Crown icon —
reused intentionally, founding is the parallel premium tier outside the
standard ladder).

**Test:** 6 source-shape assertions covering theme token + all 5 consumers'
maps.

### BUG-PHASE95-01 — Review-pending screen never polled for approval

**Files:** `apps/mobile/app/provider-onboarding/review-pending.tsx`,
`apps/mobile/__tests__/bug-phase95-01-review-pending-poll.test.ts`

The screen rendered a static "in progress" timeline and never polled.
Provider-onboarding/terms.tsx submit comment claimed this screen
"polls /provider/me for status and the customer/provider tab routing
follows the canonical role from the auth store" — but the screen had
no useQuery, no useEffect, no polling. After admin approved an
application the backend flipped `users.role` to 'provider' but the
mobile auth store stayed on 'customer' until the provider manually
re-logged in (or restarted the app).

**Fix:**
- useQuery `getMyProfile` on a 15s `refetchInterval`. The
  404-pre-approval window is swallowed and treated as 'pending'.
- When status flips to 'approved', useEffect fetches `/api/v1/auth/me`,
  pushes the refreshed User into the auth store via `setUser`, then
  `router.replace` to provider tabs/dashboard. Auth store role flip is
  driven by the canonical backend value, never set client-side.
- `status === 'rejected'` suppresses the four-step timeline (which was
  misleading after a hard reject) and renders an inline rejection
  notice with support-contact copy.

**Test:** 6 source-shape assertions covering poll setup, 404 fallback,
auth refresh, dashboard replace, rejected branch, copy.

## Phase 87 — Escalation E03 (no code change yet)

Phase 87's audit surfaced a critical regression: the customer fixed-price
checkout flow at `apps/mobile/app/customer/booking/checkout.tsx` calls
`createBooking` + `createPaymentIntent` back-to-back. `createBooking`
inserts with `status='requested'`; the payment-intent route gates on
`canTransition('requested','payment_pending')` which has returned `false`
since commit `86a2417`. **Every fixed-price customer purchase hits HTTP
409 "Cannot pay for a booking in 'requested' status".**

The original design (initial commit + d7904b4) supported instant-pay —
the test file at booking-state-machine.test.ts:17 was once labeled
"requested → payment_pending (fixed-price instant-pay)" returning `true`.
86a2417 inverted it without updating the mobile UI. No end-to-end test
covers the customer checkout flow, so the regression went unnoticed.

Three fix options written up in
`.ai-coder/escalations/E03-customer-checkout-state-machine-2026-05-05.md`.
Recommended: one-line revert of the state-machine change. Halted on this
specific issue pending Ken's call; continued auditing other screens.

## Verification

| Phase | Mobile jest | API jest | Admin vitest | tsc |
|-------|-------------|----------|--------------|-----|
| 85    | 400/400     | 2505/2505 (incl. 7 new) | n/a | clean |
| 86    | 408/408 (incl. 8 new) | 2505/2505 | n/a | clean |
| 87    | n/a (escalation only) | n/a | n/a | n/a |
| 88    | 412/412 (incl. 4 new) | 2505/2505 | n/a | clean |
| 89    | 416/416 (incl. 4 new) | 2505/2505 | n/a | clean |
| 90    | 420/420 (incl. 4 new) | 2505/2505 | n/a | clean |
| 91    | 426/426 (incl. 6 new) | 2505/2505 | n/a | clean |
| 92    | 431/431 (incl. 5 new) | 2505/2505 | n/a | clean |
| 93    | 431/431 | 2505/2505 | 105/105 (incl. 4 new) | clean |
| 94    | 437/437 (incl. 6 new) | 2505/2505 | 105/105 | clean |
| 95    | 443/443 (incl. 6 new) | 2505/2505 | 105/105 | clean |

## Cumulative since Phase 17

- Phases 17–62: 112 bugs
- Phases 63–84: 30 bugs + 22 stale tests
- Phases 85, 86, 88, 89, 90, 91, 92, 93, 94, 95: 10 bugs
- Phase 87: 1 escalation (E03 — launch blocker)

**Total: 152 real bugs surfaced and fixed since Phase 17 deep-audit pass
began. Plus 1 escalated launch-blocker regression awaiting Ken.**

## Commits

```
5fefad9 fix: Phase 95 — review-pending screen never polled for approval — 1 real bug fixed
18e3744 fix: Phase 94 — founding tier missing from every mobile TIER_* map — 1 real bug fixed
20bc9e8 fix: Phase 93 — admin CatalogPage price conversion lost float precision — 1 real bug fixed
5c2267a fix: Phase 92 — provider payout account formatting mismatch — 1 real bug fixed
140725b fix: Phase 91 — provider change-order form ignored server's 50% cap — 1 real bug fixed
ef54240 fix: Phase 90 — payment-failed countdown ignored booking creation time — 1 real bug fixed
7c9420e fix: Phase 89 — provider FAQ commission answer outdated — 1 real bug fixed
7e00fa0 fix: Phase 88 — promo carousel ctaLink silently fails on external URLs — 1 real bug fixed
845a9a0 escalation: E03 — customer fixed-price checkout broken by state-machine regression
6643ecc fix: Phase 86 — quote-accepted bookings stuck on payment_pending — 1 real bug found + fixed
9429b00 fix: Phase 85 — customer recurring screens missing enriched fields — 1 real bug found + fixed
```

## Patterns observed (carry-over from Phases 63–84)

The same bug families keep surfacing. Phase 85–93 added:

7. **Server response missing UI-required fields** — backend ships the
   `SELECT *` shape, frontend has been quietly evolving its consumed
   field list. The drift accumulates until a UI ships visibly broken
   to the user. (Phase 85 — recurring enrichment.)
8. **Status-machine state with no UI affordance** — the booking enters
   `payment_pending` after quote-accept but no screen exposes the
   action that resolves that state. The state-machine and the UI's
   button matrix have to agree, and they're maintained separately.
   (Phase 86 — pay-pending.)
9. **State-machine regression with no integration test backstop** —
   commit 86a2417 changed `requested → payment_pending` from allowed to
   disallowed without updating the mobile UI. The state-machine unit
   tests caught the rule change but no end-to-end test exercised the
   actual customer checkout flow, so the regression sat in production
   undetected. (Phase 87 / E03.)
10. **Free-text URL fields rendered with one transport** — promotions'
    `cta_link` is admin-managed free text that can be either an internal
    path or an external URL, but the consumer code assumed one transport.
    (Phase 88.)
11. **FAQ / docs drifted from the actual config** — provider help text
    described commission as ranges per tier when the live config has
    been flat-per-tier for a while. The hard-coded numbers also
    omitted entire tiers. (Phase 89.)
12. **Time-based countdown anchored on screen mount instead of server
    state** — payment-failed restarted its 72h timer every render
    rather than reading the booking's createdAt. (Phase 90.)
13. **Server-only constraint not surfaced in client UI** — change-order
    50% cap was enforced only on the server; client had no idea it
    existed. The pre-submit experience misled the provider. (Phase 91.)
14. **Server contract stricter than the client placeholder/format** —
    payout account regex rejects spaces but the placeholder showed
    "09XX XXX XXXX" with spaces; admin catalog price float arithmetic
    produced non-integer centavos that the INTEGER column rejected.
    (Phase 92, 93.)
15. **Theme/config additions not propagated to every consumer** — the
    founding tier was added to platformConfig + API TIER_LADDER but
    five separate mobile TIER_* maps still fell through to the default
    branch. (Phase 94.)
16. **"Will poll for status" comment that doesn't poll** — terms.tsx
    referenced review-pending as the polling landing screen, but the
    screen had zero polling logic. The comment created a false sense
    of completeness during code review. (Phase 95.)

## What's still genuinely outstanding

Updated from PHASES-63-84-FINAL.md:

1. **NEW LAUNCH BLOCKER:** E03 — customer fixed-price checkout 409s on
   every purchase due to state-machine regression in 86a2417. Awaiting
   Ken's call between three documented fix options (recommendation: revert).
2. F#3 + F#4 baseline capture — F#4 done; F#3 blocked on simulator
3. F#10 attorney-reviewed disclaimer wording
4. 12 D14 operational items

Plus the v1.1+ candidates documented in earlier closeouts.
