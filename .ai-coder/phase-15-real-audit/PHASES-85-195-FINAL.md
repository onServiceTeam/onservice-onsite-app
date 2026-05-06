# Phases 85–174 — Continuation deep audit pass (2026-05-05+)

Ninety phases continuing the screen-by-screen audit started in
Phases 17–84. Same recipe: read full source, identify gaps, fix narrowly,
verify with tsc + jest, commit atomically with co-author attribution.
Phase 87 surfaced a launch-blocker regression that needs Ken's call —
escalation file
`.ai-coder/escalations/E03-customer-checkout-state-machine-2026-05-05.md`.

Phases 105 + 109 + 111 + 112 + 113 + 114 + 115 + 116 + 117 + 118 +
119 + 120 + 121 + 123 + 124 form a dedicated TZ sweep — SIXTEEN
distinct UTC-leakage points hit different surfaces (mobile calendar,
admin financials/audit-log/marketing/consent, API recurring/invoice/
booking/waitlist/matching/receipt/monthly-summary, plus all the
Postgres `CURRENT_DATE` references in dashboard / metrics / pricing /
NBI alerts). Three highest-stakes items:

- **Phase 119** (CRITICAL): provider matching used
  `scheduledAt.getDay()` + `.toTimeString()` — server-local UTC.
  Every match attempt for every booking ran through this code;
  06:00 Manila Thursday bookings matched against "Wednesday at
  22:00" providers — broken matching end-to-end for early-morning
  Manila bookings.
- **Phase 120** (BIR-relevant): receipt + invoice numbers + monthly
  billing all used `getFullYear()` + `getMonth()` for the YYYYMM,
  mis-numbering by one calendar month around midnight Manila. BIR
  receipts tie to monthly filing periods; numbering drift =
  audit-trail mismatch at filing time.
- **Phase 123** (cross-cutting SQL): provider + admin "today" stats
  used Postgres `CURRENT_DATE`, which is session-TZ (UTC in our
  pool) — so for 8 hours every day (16:00–23:59 UTC) every
  dashboard's "today" total was actually yesterday Manila. Fixed
  in 13 query boundaries across 3 services in one phase.

All sixteen share one root pattern (code anchored to UTC when
Manila was meant) and one of three fix shapes:
toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) for date
strings, T...+08:00 (or Manila-anchored UTC arithmetic) for ISO
instants in JS, and `(now() AT TIME ZONE 'Asia/Manila')::date AT
TIME ZONE 'Asia/Manila'` for Postgres day-boundary comparisons.
Documented as pattern #19 below.

Phase 122 is a non-TZ dead-code cleanup of `tip.service.ts`
(matches the 103/107/110 family).

Phase 125 wires review-creation notifications + fixes wrong-key
notification icon maps on both customer and provider mobile
(3 layers — API emit, customer icon map, provider icon map +
routing).

Phase 126 cleans up 32 dead route entries in mobile navigation.ts
that pointed at non-existent screens with no consumers anywhere.
The largest dead-code cleanup of the audit.

Phase 127 wires the MED-N85 device-fingerprint refresh-token
binding end-to-end. Validator schemas were stripping the field
before the route handler could read it; mobile auth.store never
sent the field. Both ends fixed in one phase.

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

### BUG-PHASE96-01 — Data export 'expired' status indistinguishable from pending

**Files:** `apps/mobile/app/customer/account-management.tsx`,
`apps/mobile/app/provider/account-management.tsx`,
`apps/mobile/__tests__/bug-phase96-01-data-export-expired-status.test.ts`

Both account-management screens branched StatusIcon / statusColor only
on 'completed' and 'failed'; everything else fell through to Hourglass
+ grey textSecondary. The 'expired' status (set by the data-management
cron after the 30-day retention window) rendered identical to
'pending' / 'processing' — users returning later saw what looked like
"still being prepared" with no download link.

**Fix:** both screens branch 'expired' explicitly to XCircle in
textTertiary + render an inline "Expired — request again" hint.

**Test:** 6 source-shape assertions covering both screens.

### BUG-PHASE97-01 — Admin DispatchConsole map centered on wrong city

**Files:** `apps/admin/src/pages/DispatchConsolePage.tsx`,
`apps/admin/src/pages/__tests__/bug-phase97-01-dispatch-map-center.test.ts`

The dispatch map opened on Metro Manila at zoom 11 while the launch
market is Boracay (Aklan). Mobile `customer/booking/tracker.tsx`,
`provider/job/active.tsx`, and `provider/service-area.tsx` already
defaulted to Boracay coords per Phase D CRIT-77. Admin Dispatch
Console didn't get the same memo — ops opened the console at launch,
saw an empty Manila map, and panned to Boracay every shift.

**Fix:** `MANILA` constant renamed to `DEFAULT_MAP_CENTER` set to
Boracay (11.9685, 121.9162); `DEFAULT_ZOOM` tightened from 11 to 13
(Boracay is a 7km island).

**Test:** 4 source-shape assertions covering both constants + the
MapContainer center prop.

### BUG-PHASE98-01 — Admin CompliancePage TaxTab leaked a "TODO:" marker

**Files:** `apps/admin/src/pages/CompliancePage.tsx`,
`apps/admin/src/pages/__tests__/bug-phase98-01-compliance-tax-tab.test.ts`

The Tax Documents tab rendered a literal "TODO: pulls from
/api/v1/admin/bir/exports (Phase 08)" paragraph + dummy year/type
Select pickers + a "Not yet wired" EmptyState. The /api/v1/admin/bir/*
endpoints DO exist and the FinancialsPage > BIR Reports tab actually
wires them (VAT 2550M, 2307 quarterly batches, reconciliation,
overview). The TaxTab here was a duplicate stub left over from
Phase 11.

**Fix:** stub body replaced with a directive pointing admins to
Financials > BIR Reports via `useNavigate`. No "TODO:", no fake
form, no "Not yet wired" EmptyState.

**Test:** 4 source-shape assertions.

### BUG-PHASE99-01 — Admin Regulatory Reports tab made a stale ETA promise

**Files:** `apps/admin/src/pages/CompliancePage.tsx`,
`apps/admin/src/pages/__tests__/bug-phase99-01-regulatory-reports-eta.test.ts`

The Regulatory Reports tab's Generate button toasted "Regulatory
posture report not yet implemented — ETA Phase 14." Phase 14 (and
its D14 dispatches) shipped weeks before this audit; the ETA was
stale. Operators saw a date-stamped commitment to a feature that
was already past its quoted milestone.

**Fix:** copy refreshed. No baked-in ETA. Operators are now told
the report is v1.1+ and pointed at the existing v1.0 escape
hatches (Audit Log + Financials → BIR Reports).

**Test:** 3 source-shape assertions.

### BUG-PHASE100-01 — Chat notifications dumped users on booking detail

**Files:** `apps/mobile/app/customer/notifications.tsx`,
`apps/mobile/app/provider/notifications.tsx`,
`apps/mobile/__tests__/bug-phase100-01-chat-notification-routing.test.ts`

Chat-related notifications (`new_message`, `chat_last_message`,
`chat_started`) include `bookingId` in their data payload. On both
customer and provider sides the notification tap handler checked
`notifData?.bookingId` first and routed everyone to the booking/job
detail screen. To actually read the message that just buzzed, the
user had to tap "Chat with Provider" / "Chat with Customer" once
more — two taps where one should do, on the highest-frequency
notification type.

**Fix:** both screens add a chat-type short-circuit BEFORE the
generic bookingId branch. When `notif.type` matches a chat type
AND bookingId is present, route directly to the chat thread.

**Test:** 4 source-shape assertions covering both screens, including
source-order check that the chat shortcut precedes the generic
bookingId branch.

### Phase 101 — LAUNCH-LIMITATIONS #3 doc verified RESOLVED

`LAUNCH-LIMITATIONS.md` claimed the customer DSR track-requests
list view was a "Follow-up: wire a list view in data-rights.tsx
consuming the new endpoint." The wiring is already in place —
`useQuery<DsrRecord[]>` calling `listMyDsrs(50)`, full
loading/error/empty/populated states, status pills, auto-refetch
on submit. Updated section 3 to reflect reality.

No production code change.

### BUG-PHASE102-01 — Help screens disagreed with the rest of the app on version

**Files:** `apps/mobile/app/customer/help.tsx`,
`apps/mobile/app/provider/help.tsx`,
`apps/mobile/__tests__/bug-phase102-01-help-version-mismatch.test.ts`

Customer and provider help screens both rendered a hardcoded
"onService v1.0.0" footer while `(tabs)/profile.tsx` displayed the
real `platformConfig.appVersion` ('0.1.0'). Same app, two different
version strings depending on which screen the user was on.

**Fix:** both help footers now render
`onService v{platformConfig.appVersion}` so the displayed version
stays in lock-step with `package.json` (which `platform.config.ts`
mirrors).

**Test:** 5 source-shape assertions.

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
| 96    | 449/449 (incl. 6 new) | 2505/2505 | 105/105 | clean |
| 97    | 449/449 | 2505/2505 | 109/109 (incl. 4 new) | clean |
| 98    | 449/449 | 2505/2505 | 113/113 (incl. 4 new) | clean |
| 99    | 449/449 | 2505/2505 | 116/116 (incl. 3 new) | clean |
| 100   | 453/453 (incl. 4 new) | 2505/2505 | 116/116 | clean |
| 101   | n/a (doc-only verification) | n/a | n/a | n/a |
| 102   | 458/458 (incl. 5 new) | 2505/2505 | 116/116 | clean |

## Cumulative since Phase 17

- Phases 17–62: 112 bugs
- Phases 63–84: 30 bugs + 22 stale tests
- Phases 85, 86, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 102: 16 bugs
- Phase 87: 1 escalation (E03 — launch blocker)
- Phase 101: 1 doc-only LAUNCH-LIMITATIONS reconciliation

**Total: 158 real bugs surfaced and fixed since Phase 17 deep-audit pass
began. Plus 1 escalated launch-blocker regression awaiting Ken and 1
doc-only verification.**

## Commits

```
56bb33e fix: Phase 102 — help screens disagreed with the rest of the app on version — 1 real bug fixed
90fb546 docs: Phase 101 — LAUNCH-LIMITATIONS #3 mobile UI follow-up verified done
e1a5386 fix: Phase 100 — chat notifications dumped users on booking detail — 1 real bug fixed
4520931 fix: Phase 99 — admin Regulatory Reports tab made stale ETA promise — 1 real bug fixed
96032c0 fix: Phase 98 — admin CompliancePage TaxTab leaked a TODO marker — 1 real bug fixed
61a102d fix: Phase 97 — admin DispatchConsole map centered on wrong city — 1 real bug fixed
a154350 fix: Phase 96 — data export 'expired' status indistinguishable from pending — 1 real bug fixed
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

Phases 103-109 commits:
```
472f474 fix: Phase 109 — make-recurring defaulted to wrong day on non-Manila device — 1 real bug fixed
6aec7d4 fix: Phase 108 — audit log empty-state told compliance officers no entries existed when their date filter just had zero hits — 1 real bug fixed
0f3e6bc fix: Phase 107 — provider portfolio carried dead imageUrl state from a feature replacement — 1 real bug fixed
0fc60ae fix: Phase 106 — live GPS streaming was half-built with a misleading customer promise — 1 real bug fixed + launch limitation documented
1adb77c fix: Phase 105 — provider calendar dropped early-morning jobs at month start and leaked next-month jobs at month end — 1 real bug fixed
eda4072 fix: Phase 104 — confirm screen told users to "complete your payment" but offered no button to do so — 1 real bug fixed
1ef3adf fix: Phase 103 — provider checklist had ~48 lines of dead code that re-introduced the pre-fix bug if anyone touched it — 1 real bug fixed
```

Phases 110-117 commits (TZ sweep + dead-code follow-on):
```
f7e0fcf fix: Phase 117 — slot waitlist notified the wrong day's customers when a Manila booking was cancelled before 8 AM — 1 real bug fixed
b8f026e fix: Phase 116 — consent version effective date stamp leaked UTC, gave 8-hour gap of wrong consent applied — 1 real bug fixed
02d655b fix: Phase 115 — promo codes were valid 8 hours longer than the admin set because validUntil was stamped UTC — 1 real bug fixed
05c8a1b fix: Phase 114 — API CSV export filename + invoice-overdue cron leaked UTC date — 1 real bug fixed (2 surfaces)
27808fc fix: Phase 113 — recurring cron compared next_booking_date to UTC, delaying early-morning Manila bookings up to 16 hours — 1 real bug fixed
67d386f fix: Phase 112 — admin financials and compliance CSV filename leaked UTC date for Manila admins — 1 real bug fixed (2 surfaces)
989a53e fix: Phase 111 — admin consent-versions effective-date defaulted to UTC, not Manila — 1 real bug fixed
032d6d1 fix: Phase 110 — provider navigate screen carried dead ETA styles after Phase 59-02 fix removed the misleading card — 1 real bug fixed
```

Phases 118-121 commits (TZ sweep continued — server-side):
```
ce3dc91 fix: Phase 121 — provider monthly-summary endpoint defaulted to UTC year/month, not Manila — 1 real bug fixed
bc30ea8 fix: Phase 120 — receipt + invoice number + monthly billing all leaked UTC YYYYMM, mis-numbering by month around midnight Manila — 1 real bug fixed (3 surfaces, BIR-relevant)
8e415c2 fix: Phase 119 — CRITICAL provider matching used UTC weekday + time, so 06 AM Manila bookings matched against 22:00 Wednesday providers — 1 real bug fixed (2 surfaces)
1f2bbb2 fix: Phase 118 — recurring next-date math used server-local UTC instead of Manila, scheduling early-Manila-morning customers' first instance for the wrong week — 1 real bug fixed
```

Phases 122-124 commits (dead-code + Postgres CURRENT_DATE sweep):
```
0db20d4 fix: Phase 124 — pricing holidays + NBI expiry alert leaked UTC, listing yesterday-Manila events as "upcoming" — 1 real bug fixed (2 surfaces)
1fe4491 fix: Phase 123 — provider + admin "today" SQL stats leaked UTC for 8 hours every Manila day — 1 real bug fixed (3 surfaces, 13 query boundaries)
7b96eb7 fix: Phase 122 — tip.service carried dead `method === 'wallet'` branches after MED-N153 hardened to wallet-only — 1 real bug fixed
```

Phases 125-127 commits (notification end-to-end + dead routes + security wire):
```
7ff4687 fix: Phase 127 — MED-N85 device-fingerprint refresh-token binding was disabled by validator strip + missing client wiring — 1 real bug fixed (3 layers)
16ba16d fix: Phase 126 — mobile navigation.ts had 32 dead route entries pointing at non-existent screens — 1 real bug fixed (32 entries cleaned)
a78a5cc fix: Phase 125 — review notification end-to-end was broken in 3 layers — 1 real bug fixed (3 surfaces, 3 layers)
```

### BUG-PHASE103-01 — Provider checklist carried 48 lines of dead code that re-introduced the pre-fix bug

**Files:** `apps/mobile/app/provider/job/[id]/checklist.tsx`,
`apps/mobile/__tests__/bug-phase103-01-checklist-dead-initial-sections.test.ts`

`provider/job/[id]/checklist.tsx` still carried `INITIAL_SECTIONS` (53
lines) plus a `makeItem` helper at the top, despite the screen having
been migrated in Phase E CRIT-105 to fetch from
`/api/v1/jobs/:id/checklist`. `useState` was already initialized to
`[]` — nothing read `INITIAL_SECTIONS` — but the dead constant still
spelled out the exact "Living Room → Kitchen → Bedroom → Bathroom"
hardcoded list the CRIT-105 comment block calls out as the original
bug (a plumber saw cleaning items instead of the plumbing checklist
tied to category_id).

**Fix:** delete `makeItem` helper + `INITIAL_SECTIONS` array. Server
data is now the only source of truth at runtime AND in source.

**Test:** 6 source-shape assertions confirm `INITIAL_SECTIONS` gone,
`makeItem` gone, hardcoded section titles + item labels gone,
`useState` still initializes to `[]`, and the
`/api/v1/jobs/:id/checklist` fetch path still wired.

### BUG-PHASE104-01 — Confirm screen told users to "complete payment" with no button to do so

**Files:** `apps/mobile/app/customer/booking/confirm.tsx`,
`apps/mobile/__tests__/bug-phase104-01-confirm-payment-pending-cta.test.ts`

`booking/confirm.tsx` had a UX gap when a booking landed there in
`payment_pending` (typically: PayMongo checkout failed, was cancelled,
or the user backed out of GCash/Maya). Subtitle said "Complete your
payment to confirm this booking." but no Complete Payment CTA was
rendered. The only forward path was tap "View Booking" → then find
Complete Payment on `/customer/booking/[id]` (which Phase 86 added).
Two taps where one should do, on the screen that explicitly told the
user to pay.

**Fix:** when booking is loaded and `!isPaid`, render a direct
"Complete Payment" CTA at the top of the actions stack that routes to
`/customer/booking/pay?bookingId={id}`. View Booking drops to outline
variant when unpaid so Complete Payment reads as the primary action;
when paid, View Booking stays primary as before.

**Test:** 5 source-shape assertions confirm Complete Payment button
rendered conditionally on `!isPaid`, routes to the pay screen, View
Booking switches to outline when unpaid, `isPaid` still derived from
the same status/escrowStatus check, existing subtitle copy preserved.

### BUG-PHASE105-01 — Provider calendar dropped early-morning month-start jobs and leaked next-month jobs

**Files:** `apps/mobile/app/provider/calendar.tsx`,
`apps/mobile/__tests__/bug-phase105-01-calendar-manila-timezone.test.ts`

Two month-boundary timezone defects in `provider/calendar.tsx`:

1. `getMonthRange` built `from`/`to` with `T00:00:00Z` and
   `T23:59:59Z` — UTC-anchored. Manila (UTC+8) day 1 starts at 16:00
   UTC of the previous day, so jobs scheduled 00:00–07:59 Manila on
   the 1st of the month were 16:00–23:59 UTC of the previous day and
   fell OUTSIDE the from-anchor. A 6 AM appointment on May 1 was
   simply invisible to the provider's calendar. Conversely, jobs at
   00:00 Manila on the 1st of the next month (16:00 UTC of the last
   day) WERE inside the to-anchor and bled into the current view.
2. `toDateKey` used `d.getFullYear/Month/Date()`, which return
   device-local values. On a non-Manila device (QA/staging on UTC, a
   Filipino traveling abroad), jobs near midnight Manila landed on
   the wrong calendar cell — off by one day.

**Fix:** anchor `from`/`to` to `+08:00` Manila offset, and bin
scheduledAt timestamps via
`toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })`.

**Test:** 4 source-shape assertions confirm `+08:00` anchors present,
`Z` anchors gone, `toDateKey` uses Manila tz, device-local
getFullYear/getMonth path gone.

### BUG-PHASE106-01 — Live GPS streaming half-built feature with misleading customer promise

**Files:** `apps/mobile/app/customer/safety-and-support.tsx`,
`apps/mobile/src/lib/i18n.ts`, `LAUNCH-LIMITATIONS.md`,
`apps/mobile/__tests__/bug-phase106-01-gps-streaming-half-built.test.ts`

The customer-facing `safety-and-support.tsx` promised "See your
provider's location on the map while they're on the way to you" but
no provider-side code ever emits the `booking:${id}:location` socket
event the customer tracker subscribes to. `provider/job/active.tsx`
captures location ONCE at "I've Arrived" — there's no
`watchPositionAsync` loop, no en-route streaming.

**Fix:** three pieces.

1. `safety-and-support.tsx` copy softened to "Live status updates",
   describing what actually works: push notifications + on-screen
   status pill changes (paid → provider_en_route → provider_arrived
   → in_progress via the existing `:status` socket event) +
   booking-address map.
2. Dead i18n key `provider.gps.broadcasting` removed from
   `apps/mobile/src/lib/i18n.ts` — never consumed.
3. `LAUNCH-LIMITATIONS.md` section 32 documenting the gap so
   operators have a script when customers ask "why isn't the
   provider's pin moving?". v1.1 plan: `watchPositionAsync` in
   `active.tsx` + server endpoint that re-broadcasts to the existing
   `booking:${id}:location` channel. Customer-side subscription left
   in place so v1.1 only needs to land the producer side.

**Test:** 5 source-shape assertions confirm misleading copy gone,
"Live status updates" framing in place, dead i18n key gone,
LAUNCH-LIMITATIONS section 32 present, customer-side socket
subscription preserved (regression guard for v1.1).

### BUG-PHASE107-01 — Provider portfolio carried dead `imageUrl` state from Phase E CRIT-108 feature replacement

**Files:** `apps/mobile/app/provider/portfolio.tsx`,
`apps/mobile/__tests__/bug-phase107-01-portfolio-dead-imageurl-state.test.ts`

`provider/portfolio.tsx` still had `imageUrl` + `setImageUrl` useState
from the pre-fix paste-URL UX, even though Phase E CRIT-108 replaced
that flow with a picker + `uploadImages` multipart pipeline. The
state was only ever cleared (in `resetForm` and `handleAdd`) — never
read by any JSX. Same shape as Phase 103's INITIAL_SECTIONS — leftover
from a feature replacement.

**Fix:** remove the useState declaration, remove both `setImageUrl('')`
call sites in `resetForm` + `handleAdd`.

**Test:** 4 source-shape assertions confirm useState gone,
setImageUrl call sites gone, actual `pendingLocalUri` picker state
still in place, picker → upload → mutate pipeline still wired.

### BUG-PHASE108-01 — Audit log empty-state told compliance officers no entries existed when their date filter just had zero hits

**Files:** `apps/admin/src/pages/AuditLogPage.tsx`,
`apps/admin/src/pages/__tests__/bug-phase108-01-audit-log-empty-state-filter-aware.test.ts`

Admin AuditLogPage empty state checked only
`actionFilter || entityTypeFilter` to decide between "Try adjusting
your filters" and "Audit entries will appear as system actions
occur." The page also exposes `sourceFilter`, `fromDate`, and `toDate`
filters. When a compliance officer narrowed by date range or source
stream and got zero hits, the empty state claimed NO entries exist
anywhere in the system — the opposite of the truth, the kind of
false-negative that buries compliance investigations.

**Fix:** the empty-state condition mirrors the same filter-aware
condition the page already uses to show the "Clear Filters" button.

**Test:** 3 source-shape assertions confirm new condition references
all five filters in expected order, pre-fix narrow check gone, both
call sites use the same condition.

### BUG-PHASE110-01 — Provider navigate screen carried dead ETA styles after Phase 59-02 fix removed the misleading card

**Files:** `apps/mobile/app/provider/job/[id]/navigate.tsx`,
`apps/mobile/__tests__/bug-phase110-01-navigate-dead-eta-styles.test.ts`

`provider/job/[id]/navigate.tsx` had three dead styles (`etaCard`,
`etaLabel`, `etaValue`) sitting in StyleSheet.create after Phase 59-02
ripped out the hardcoded "ETA: ~25 min" card. The fix-comment at
line ~161 already calls out that the fake card was removed — but the
styles backing it were left behind.

Same dead-code pattern as Phase 103 (INITIAL_SECTIONS) and Phase
107 (imageUrl useState). Risk: a future maintainer wiring an ETA
back in could grab the dead style names and re-introduce the
pre-fix card before the real Google Distance Matrix / Mapbox
Directions query is wired.

**Fix:** delete `etaCard` + `etaLabel` + `etaValue` from styles. The
`colors.successDark` reference (only consumed by these three dead
styles) drops with them.

**Test:** 5 source-shape assertions confirm all three dead styles
gone, the colors.successDark reference gone, and the Google Maps
+ Waze buttons still wired.

### BUG-PHASE111-01 — Admin consent-versions effective-date defaulted to UTC, not Manila

**Files:** `apps/admin/src/pages/ConsentVersionsPage.tsx`,
`apps/admin/src/pages/__tests__/bug-phase111-01-consent-versions-tz-default-date.test.ts`

`ConsentVersionsPage.tsx`'s `todayLocalIso()` helper used
`new Date().toISOString().slice(0, 10)` — UTC date. For a DPO admin
in Manila publishing late at night (00:30 Manila Thursday = 16:30
UTC Wednesday), the effectiveDate field defaulted to "Wednesday"
while the admin saw the page on "Thursday". A one-day shift on a
legally relevant field (effectiveDate determines when a consent
version is in force for the active-users count and audit trail).

**Fix:** replace `toISOString().slice(0, 10)` with
`toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })`.

**Test:** 4 source-shape assertions confirm new tz-aware call,
pre-fix UTC pattern gone, function name preserved, two call sites
(initial state + closePublishDialog reset) preserved.

### BUG-PHASE112-01 — Admin financials and compliance CSV filename leaked UTC date

**Files:** `apps/admin/src/pages/FinancialsPage.tsx`,
`apps/admin/src/pages/CompliancePage.tsx`,
`apps/admin/src/pages/__tests__/bug-phase112-01-utc-leakage-financials-compliance.test.ts`

Two more UTC leakage points in admin:
1. `FinancialsPage.tsx` `todayIso()` and `daysAgoIso()` defaulted the
   from/to date-range pickers to UTC. For an admin in Manila opening
   the page at 00:30 Manila Thursday, the default `to` was Wednesday —
   Thursday's revenue was off-screen.
2. `CompliancePage.tsx` audit-log CSV export filename used UTC.
   Compliance officers downloading at 00:30 Manila Thursday got a
   file named with Wednesday UTC date.

**Fix:** all three call sites use
`toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })`.

**Test:** 5 source-shape assertions across both files.

### BUG-PHASE113-01 — Recurring cron compared next_booking_date to UTC, delaying early-morning Manila bookings up to 16 hours

**Files:** `packages/api/src/services/recurring.service.ts`,
`packages/api/__tests__/bug-phase113-01-recurring-cron-manila-day.test.ts`

`processRecurringBookings()` set `today = new Date().toISOString().split('T')[0]!`
(UTC), then compared to `rb.next_booking_date <= $1` where
next_booking_date is populated from a Manila YYYY-MM-DD. For a
recurring 06:00 Manila booking on the 5th (= 22:00 UTC on the 4th),
the cron had to wait until UTC ticked over to the 5th — which is
08:00 Manila — so the booking was created TWO HOURS after its
preferred time, with the auto-charge attempt firing late.

**Fix:** anchor `today` to Manila day via
`toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })`.

**Test:** 4 source-shape assertions confirm new tz-aware today,
pre-fix UTC line gone, scheduledAt +08:00 construction preserved,
active-status / customer-is-active filters preserved.

### BUG-PHASE114-01 — API CSV export filename + invoice-overdue cron leaked UTC date

**Files:** `packages/api/src/routes/compliance-admin.routes.ts`,
`packages/api/src/services/invoice.service.ts`,
`packages/api/__tests__/bug-phase114-01-utc-leakage-compliance-invoice.test.ts`

Two more UTC leakage points server-side:
1. `compliance-admin.routes.ts` audit-log CSV export's
   Content-Disposition filename used UTC. Pairs with Phase 112's
   browser-side filename fix — both paths needed Manila day for
   consistency.
2. `invoice.service.ts` `checkOverdueInvoices` cron compared UTC
   `today` to `due_date` (Manila YYYY-MM-DD). Invoices due "today
   Manila" got marked overdue 8 hours late.

**Fix:** both call sites use
`toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })`.

**Test:** 6 source-shape assertions across both files.

### BUG-PHASE115-01 — Promo codes were valid 8 hours longer than the admin set because validUntil was stamped UTC

**Files:** `apps/admin/src/pages/MarketingPage.tsx`,
`apps/admin/src/pages/__tests__/bug-phase115-01-promo-valid-until-manila.test.ts`

`MarketingPage.tsx`'s CreatePromoDialog and EditPromoDialog stamped
`validUntil` with `T23:59:59Z` (UTC). For a Manila admin entering
"Valid until 2026-05-31", the suffix made the promo expire at
2026-05-31T23:59:59 UTC = 2026-06-01T07:59:59+08:00 Manila — 8 extra
hours of validity into the morning of the following Manila day.
Customers booking before 8 AM on June 1 could still apply a "May
only" promo. Durable bug — value persisted to the API.

**Fix:** both call sites use `T23:59:59+08:00` Manila offset.

**Test:** 3 source-shape assertions confirm both call sites use
+08:00, neither uses Z, body.validUntil wiring preserved.

### BUG-PHASE116-01 — Consent version effective date stamp leaked UTC, gave 8-hour gap of wrong consent applied

**Files:** `apps/admin/src/pages/ConsentVersionsPage.tsx`,
`apps/admin/src/pages/__tests__/bug-phase116-01-consent-effective-at-manila.test.ts`

`ConsentVersionsPage.tsx`'s publish dialog stamped the picked
effectiveDate with `T00:00:00Z` (UTC midnight). For a Manila DPO
selecting "Effective Wednesday May 5", the persisted value was
2026-05-05T00:00:00 UTC = 2026-05-05T08:00:00+08:00 Manila — so
customers booking between 00:00 and 08:00 Manila on May 5 were still
bound by the OLD consent version. NPC RA 10173-relevant: an 8-hour
window of "wrong consent applied" is not acceptable.

Pairs with Phase 111 (the picker DEFAULT was already fixed; this
fixes the SUBMIT path so the day is preserved end-to-end).

**Fix:** stamp with `T00:00:00+08:00` instead of `Z`.

**Test:** 4 source-shape assertions confirm new offset, pre-fix
UTC stamp gone, fallback "now()" preserved, publishMutation wiring
preserved.

### BUG-PHASE125-01 — Review notification end-to-end was broken in 3 layers (API never emitted, customer + provider icon maps wrong-keyed)

**Files:** `packages/api/src/services/review.service.ts`,
`apps/mobile/app/customer/notifications.tsx`,
`apps/mobile/app/provider/notifications.tsx`,
`packages/api/__tests__/bug-phase125-01-review-notification-icon-keys.test.ts`

Three layered defects compounded into "provider has no idea a review
was left, and even if they did the notification would render with the
wrong icon and not route anywhere":

1. API: `review.service.createReview` never emitted any notification,
   even though `notification.service.ts` declared `rating_received`
   in its NotificationType union and customer/provider mobile
   `notifications.tsx` expected to render + route on it.
2. Customer mobile: icon map keyed on `review_received` (a string
   the API never emits) — fell through to Bell. Routing branch
   with the same key — dead. Several other types (chat_started,
   new_message, customer_cancelled, recurring_auto_charge_*,
   new_quote, etc.) weren't in the icon map at all.
3. Provider mobile: icon map keyed on EIGHT types the API never
   emits (`new_booking`, `booking_assigned`, `payment_received`,
   `dispute_opened`, `review_received`, `payout_completed`,
   `tip_received`). EVERY provider notification fell back to Bell.

**Fix:**
- review.service emits `rating_received` after the trx commits
  (best-effort — failure does NOT roll back the review).
- Customer icon map: replace `review_received` with `rating_received`,
  expand to cover chat / cancellation / recurring auto-charge /
  quote types.
- Provider icon map: replace 8 wrong keys with actual API-emitted
  types (new_job_available, job_completed, payment_released,
  dispute_update, rating_received, tier_upgrade, nbi_expiring,
  provider_approved, provider_suspended, customer_cancelled,
  new_message, change_order_expired, recurring_auto_charge_*).
  Routing updated to match. Added tier_upgrade →
  /provider/tier-progression and nbi_expiring →
  /provider/account-management routing.

**Test:** 15 source-shape assertions across all 3 layers.

### BUG-PHASE126-01 — Mobile navigation.ts had 32 dead route entries pointing at non-existent screens

**Files:** `apps/mobile/src/config/navigation.ts`,
`packages/api/__tests__/routes-registry-bug-1185.test.ts` (updated),
`apps/mobile/__tests__/bug-phase126-01-navigation-dead-routes-removed.test.ts`

`apps/mobile/src/config/navigation.ts` had 32 route entries
pointing at screens that don't exist on disk and have NO consumers
anywhere in the app. The file's own header claims to be "single
source of truth for mobile route paths"; entries that 404
contradict that contract — documentation debt that misleads new
contributors AND landmines for future code that wires them.

Verification before deletion: each entry checked for `.tsx` file
(none existed), grep'd as `Routes.X.KEY` and as raw string literal
(zero hits in non-config files).

CUSTOMER block (24 dead removed): SUBCATEGORY, BOOKING_TRACKER,
RATE_REVIEW, PROFILE, PROVIDER_LIST, RECURRING_SETUP,
BUSINESS_ACCOUNTS / DETAIL / CREATE / MEMBERS / CONTRACTS /
INVOICES / INVOICE_DETAIL, SERVICE_AREAS, SERVICE_AREA_DETAIL,
WAITLIST, REBOOKING, SLOT_WAITLIST, DATA_PRIVACY, DATA_EXPORT,
ACCOUNT_DELETION, SECURITY_SETTINGS, DEVICE_MANAGEMENT,
ACCESSIBILITY_SETTINGS, ADD_ADDRESS, ADD_PAYMENT, PROMOTIONS,
SUPPORT, EMAIL_VERIFICATION.

PROVIDER block (8 dead removed): HOME, WALLET, EARNINGS,
EARNINGS_GOALS, DEMAND_INSIGHTS, MONTHLY_SUMMARY, RECEIPT,
MATERIALS_LIST, PROFILE.

**Test:** 43 source-shape assertions confirm every removed key is
gone + 6 regression guards confirming live routes are preserved.
The Phase-14 `routes-registry-bug-1185.test.ts` "substitutes
multiple params" assertion was updated to use a synthetic
multi-param template (the previous BUSINESS_INVOICE_DETAIL key
was one of the 32 removed).

### BUG-PHASE127-01 — MED-N85 device-fingerprint refresh-token binding was completely disabled by validator strip + missing client wiring

**Files:** `packages/api/src/validators/auth.validators.ts`,
`apps/mobile/src/stores/auth.store.ts`,
`packages/api/__tests__/bug-phase127-01-device-fingerprint-binding-end-to-end.test.ts`

The MED-N85 device-fingerprint binding feature (detect stolen
refresh tokens by comparing the issuance fingerprint to the
refresh-attempt fingerprint) was on paper only. Two compounding
defects:

1. `sendOtpSchema` and `verifyOtpSchema` only declared {phone}
   and {phone, code}. Zod's default behavior on .parse() is to
   STRIP unknown keys. So when the mobile client sent
   {phone, code, deviceFingerprint}, the validator stripped it
   before the route handler at auth.routes.ts (which DID read
   `req.body.deviceFingerprint`) could see it.
2. The mobile auth.store never sent the fingerprint anyway —
   `device-fingerprint.service.getDeviceFingerprint()` had ZERO
   production consumers. The CRIT-K01 test only verified the
   secure-storage migration shape.

Net pre-fix: stolen refresh tokens could not be detected;
`req.body.deviceFingerprint` was always undefined; the no-bind
fall-through path always ran.

**Fix:**
- `auth.validators.ts`: factored `DEVICE_FINGERPRINT_FIELD` as a
  shared optional bounded string (8-256 chars, matching the
  pre-existing refreshTokenSchema bounds) and added it to both
  sendOtpSchema and verifyOtpSchema.
- `auth.store.ts`: imports getDeviceFingerprint and calls it in
  requestOtp + verifyOtp via try/catch fallback (so a fingerprint
  generation failure doesn't block sign-in). Both helpers pass
  the fingerprint to the API.

**Test:** 10 source-shape assertions across 3 files (validators,
auth.store, route reads as regression guard).

### BUG-PHASE122-01 — tip.service carried dead method-check branches after MED-N153 hardened to wallet-only

**Files:** `packages/api/src/services/tip.service.ts`,
`packages/api/__tests__/bug-phase122-01-tip-service-dead-branches.test.ts`

`tip.service.ts` `sendTip()` had three nested
`if (method === 'wallet')` blocks plus a
`method === 'wallet' ? 'completed' : 'pending'` ternary inside the
transaction body — all dead after MED-N153 added a
`if (method !== 'wallet') throw` gate at the top of the function.
Once that gate runs, `method` is the literal string 'wallet'; every
conditional below it always took the wallet branch and the
'pending' status string was unreachable.

Same dead-branch pattern as Phases 103 (provider checklist
INITIAL_SECTIONS), 107 (portfolio imageUrl useState), 110
(navigate.tsx ETA styles). Risk: a future maintainer re-enabling
non-wallet methods by lifting the MED-N153 gate without re-auditing
the inside-of-trx logic would silently regress MED-N153.

**Fix:** collapse the dead branches into straight-through wallet
logic. The tips INSERT now hardcodes `payment_method='wallet'` and
`status='completed'` in the SQL itself.

**Test:** 5 source-shape assertions confirm the dead conditions
are gone, the SQL hardcodes the v1.0 invariant, the MED-N153 gate
+ provider notification are preserved.

### BUG-PHASE123-01 — Provider + admin "today" SQL stats leaked UTC for 8 hours every Manila day

**Files:** `packages/api/src/services/provider-tools.service.ts`,
`packages/api/src/services/admin.service.ts`,
`packages/api/src/services/metrics.service.ts`,
`packages/api/__tests__/bug-phase123-01-current-date-manila.test.ts`

Postgres `CURRENT_DATE` / `DATE_TRUNC(..., CURRENT_DATE)`
returns/anchors to the session timezone, which is UTC in our pool.
Three services anchored "today" / "this week" / "this month"
boundaries to CURRENT_DATE, so during the 16:00–23:59 UTC window
(= 00:00–07:59 Manila next day) the dashboards showed yesterday-
Manila totals while the user's wall clock said "today":

1. `provider-tools.service.ts` getEarningsSummary — provider's
   "Earned Today" / "Earned This Week" / "Earned This Month" +
   matching job counts.
2. `admin.service.ts` getDashboardKpis — "Today's Revenue" + "New
   Signups Today" + "Bookings Today."
3. `metrics.service.ts` — internal "Completed Today" / "Cancelled
   Today" / "Payments Today" / "Revenue Today" (Prometheus +
   admin overlays).

13 query boundaries across 3 services fixed in one phase.

**Fix:** anchor each "since today midnight Manila" boundary to
`(now() AT TIME ZONE 'Asia/Manila')::date AT TIME ZONE 'Asia/Manila'`
— the UTC instant of Manila midnight. Week/month boundaries use
`DATE_TRUNC('week', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'`.

**Test:** 7 source-shape assertions across all three services.

### BUG-PHASE124-01 — Pricing holidays + NBI expiry alert leaked UTC, listing yesterday-Manila events as "upcoming"

**Files:** `packages/api/src/services/pricing.service.ts`,
`packages/api/src/services/admin-analytics.service.ts`,
`packages/api/__tests__/bug-phase124-01-pricing-nbi-current-date-manila.test.ts`

Follow-on to Phase 123 cleaning up the last two CURRENT_DATE
leakage points:

1. `pricing.service.ts` getUpcomingHolidays — listed yesterday-Manila
   holidays as "upcoming" for ~8 hours after they actually passed.
2. `admin-analytics.service.ts` NBI expiry alert — the `BETWEEN
   CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'` shifted by
   8 hours; expiring-soon alert delayed by Manila/UTC drift.

**Fix:** replace `CURRENT_DATE` with
`(now() AT TIME ZONE 'Asia/Manila')::date` on both bounds.

**Test:** 4 source-shape assertions across both files.

This completes the API-side CURRENT_DATE cleanup. Total Manila-tz
family across the audit: 16 distinct UTC-leakage points fixed.

### BUG-PHASE118-01 — Recurring next-date math used server-local UTC, scheduling early-Manila-morning customers' first instance for the wrong week

**Files:** `packages/api/src/services/recurring.service.ts`,
`packages/api/__tests__/bug-phase118-01-calculate-next-date-manila.test.ts`

`calculateNextDate()` did weekday/month math via
`setHours(0,0,0,0) + getDay/getDate/setDate/setMonth/getMonth` — all
device-local. Server runs UTC, so for a customer creating a "weekly
Thursday" recurring at 01:00 Manila Thursday (= 17:00 UTC Wednesday),
server computed "next Thursday" = today UTC + 1 day = today Manila —
scheduling the FIRST instance for the SAME Manila day they were
already in. Customer expected next Thursday to mean a week from
today (since today is already Thursday). Same off-by-one applied to
bi_weekly (one week early) and monthly (could land in current month
instead of next).

**Fix:** anchor math to Manila calendar day. `result` built as
UTC-midnight of the Manila day, then UTC methods used throughout.
Manila is +08:00 with no DST, so UTC arithmetic on a Manila-anchored
UTC-midnight Date is equivalent to Manila arithmetic.

**Test:** 7 source-shape assertions confirm pre-fix setHours +
device-local methods gone, manilaDateStr extracted via Asia/Manila,
result anchored to UTC-midnight of the Manila day, weekly + bi_weekly
+ monthly all use setUTCxxx + getUTCxxx variants, fromDate parameter
preserved.

### BUG-PHASE119-01 — CRITICAL provider matching used UTC weekday + time, so 06 AM Manila bookings matched against 22:00 Wednesday providers

**Files:** `packages/api/src/services/matching.service.ts`,
`packages/api/__tests__/bug-phase119-01-matching-manila-day-time.test.ts`

`findMatchingProviders` and `findMatchingProvidersSimple` extracted
day-of-week and time-of-day via `scheduledAt.getDay()` and
`scheduledAt.toTimeString().slice(0, 8)` — both server-local. For a
06:00 Manila Thursday booking (= 22:00 UTC Wednesday), `getDay()`
returned 3 (Wed) instead of 4 (Thu), and the time string returned
"22:00:00" instead of "06:00:00". The matching SQL filter:

  provider_availability.day_of_week = $dayOfWeek
  AND start_time <= $timeStr AND end_time >= $timeStr

So the query went looking for providers available "Wednesday at
22:00." Providers actually working Thursday morning got filtered
OUT; providers running unusual late-Wed-night schedules got
included. Customer either matched to wrong provider or got "no
providers available"; matching providers got no offers.

This is the highest blast radius bug in the sweep — every match
attempt for every booking ran through this code.

**Fix:** introduce `manilaDayOfWeek` + `manilaTimeString` helpers
using toLocaleDateString('en-US', { timeZone: 'Asia/Manila',
weekday: 'short' }) → Sun..Sat → 0..6 map, and toLocaleTimeString
('en-GB', { timeZone: 'Asia/Manila', hour12: false }) → "HH:MM:SS".
Both matchers call them.

**Test:** 7 source-shape assertions confirm both helpers present,
weekday-index map matches SQL shape, both matchers route through
helpers (not raw scheduledAt.getDay/toTimeString), pre-fix code
gone, overnight-schedule SQL (MED-N104) preserved.

### BUG-PHASE120-01 — Receipt + invoice number + monthly billing all leaked UTC YYYYMM (BIR-relevant)

**Files:** `packages/api/src/services/provider-tools.service.ts`,
`packages/api/src/services/invoice.service.ts`,
`packages/api/__tests__/provider-tools-receipt-monthly-med-n31-n32-n33-n35.test.ts` (updated),
`packages/api/__tests__/bug-phase120-01-receipt-invoice-numbering-manila.test.ts`

Three BIR-relevant numbering / monthly-period surfaces all used
device-local YYYYMM extraction:

1. provider-tools receiptNumber generator: `RCP-${getFullYear}${getMonth+1}-...`
   issued at 01:00 Manila June 1 → "RCP-202605-..." instead of
   "RCP-202606-...".
2. invoice generateInvoiceNumber: same shape, `INV-${getFullYear}${getMonth+1}-...`.
3. invoice generateMonthlyInvoices "last month" calc: at 16:00 UTC
   May 31 (= 00:00 Manila June 1), server saw `getMonth() = 4` (May
   UTC) → "lastMonth = April" — billed April twice, missed May
   entirely.

BIR receipts and invoices file by Manila monthly period; numbering
drift = audit-trail mismatch.

**Fix:** anchor YYYYMM to Manila via toLocaleDateString('en-CA',
{ timeZone: 'Asia/Manila' }) + string slice. For "last month" calc,
build UTC-midnight from Manila day and use Date.UTC + getUTC methods.

**Test:** 9 source-shape assertions across all three surfaces.

### BUG-PHASE121-01 — Provider monthly-summary endpoint defaulted to UTC year/month

**Files:** `packages/api/src/routes/provider.routes.ts`,
`packages/api/__tests__/med-n59-n98-n169-fixes.test.ts` (updated),
`packages/api/__tests__/bug-phase121-01-provider-monthly-summary-manila.test.ts`

GET `/providers/me/monthly-summary` defaulted year/month to
device-local UTC via `now.getFullYear()` and `now.getMonth() + 1`.
Provider opening "this month" at 01:00 Manila June 1 saw May's
summary instead of June. The MED-N98 upper bound (`now.getFullYear()
+ 1`) had the same off-by-one in late-Dec / early-Jan windows.

**Fix:** anchor year + month to Manila via toLocaleDateString
slice → manilaYear / manilaMonth. Default + upper bound both use
the Manila-anchored values.

**Test:** 7 source-shape assertions. MED-N98 sanity floor
preserved.

### BUG-PHASE117-01 — Slot waitlist notified the wrong day's customers when a Manila booking was cancelled before 8 AM

**Files:** `packages/api/src/services/booking.service.ts`,
`packages/api/__tests__/bug-phase117-01-slot-waitlist-manila-date.test.ts`

`booking.service.ts` `updateStatus` used the UTC date of `scheduled_at`
when notifying slot waitlist after a cancellation:

  `const dateStr = updated.scheduled_at.toISOString().split('T')[0]!;`

But `slot_waitlist.preferred_date` is a Manila YYYY-MM-DD — the date
the customer asked for in their local context. When an early-morning
Manila booking was cancelled (06:00 Manila May 5 = 22:00 UTC May 4),
the lookup searched for "2026-05-04" instead of "2026-05-05".
Customers waitlisted for May 4 got notifications for a slot that
opened up on May 5 — wrong day, while the actual May 5 waitlist sat
unnotified.

**Fix:** convert `scheduled_at` via
`toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })`.

**Test:** 4 source-shape assertions confirm new tz-aware dateStr,
pre-fix UTC line gone, processSlotAvailability call wiring preserved,
cancellation gate (provider/admin) preserved.

### BUG-PHASE109-01 — Make-recurring defaulted to wrong day on non-Manila device

**Files:** `apps/mobile/app/customer/booking/make-recurring.tsx`,
`apps/mobile/__tests__/bug-phase109-01-make-recurring-tz-default-day.test.ts`

Make-recurring's preferred-day default ran
`new Date(booking.scheduledAt).getDay()`, which returns the
device-local weekday rather than Manila's. For a booking scheduled
at 1:30 AM Thursday Manila (= 17:30 UTC Wednesday), a customer on
a UTC-12 device interpreted the timestamp as 05:30 UTC-12 Wednesday —
`getDay()` returned 3 (Wed). The screen defaulted the recurring
schedule to Wednesdays, off by one. Same Manila-tz pattern as Phase
105's calendar fix.

**Fix:** extract the weekday in Manila timezone via
`toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short' })`,
then map `'Sun'`/`'Mon'`/.../`'Sat'` to the index used by the chip
row. Guard with `if (dayIndex >= 0)` against locale-string mismatch.

**Test:** 5 source-shape assertions confirm pre-fix `.getDay()` gone,
manila weekday extracted via Asia/Manila, mapped via Sun..Sat array,
guarded against -1, dayTouched gate preserved.

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
17. **Dead state from feature replacement** — when Phase E CRIT-108
    replaced the paste-URL UX with a picker pipeline, the old
    `imageUrl` useState wasn't deleted. Same shape as Phase 103's
    INITIAL_SECTIONS — leftover code that does nothing today but
    could mislead a future maintainer into wiring it back into a
    flow that already shipped past it. (Phases 103, 107.)
18. **Status-machine state reached without a CTA on the landing
    screen** — booking lands on `/customer/booking/confirm` in
    `payment_pending` after a cancelled PayMongo flow. The screen
    tells the user to "complete payment" but offers no button to do
    so. The state-machine and the screen's button matrix have to
    agree, the dispatch only fixed one side. (Phase 104.)
19. **UTC-anchored date ranges + device-local day binning for a
    Manila-only platform** — `getMonthRange` used `Z` anchors and
    `toDateKey` used `getFullYear/Month/Date`. Both produced wrong
    results at month boundaries / midnight Manila for non-Manila
    devices. Same pattern hit `make-recurring`'s default day.
    (Phases 105, 109.)
20. **Half-built feature with the customer-facing promise still in
    place** — live provider GPS streaming was wired on the customer
    side (subscription, marker render) but never had a producer; the
    safety screen still promised it. Either build the missing side
    or soften the claim — never ship a specific promise the app
    can't keep. (Phase 106.)
21. **Empty-state messaging filter-blind** — admin audit log empty
    state checked only 2 of 5 filter inputs to decide between "no
    data" and "filters too narrow". A compliance officer narrowing
    by date got told no entries existed at all. The "Clear Filters"
    button condition was correct but the empty-state condition
    drifted from it. (Phase 108.)

19. **UTC anchor for a Manila-only platform — pervasive cross-package**
    — between Phases 105 and 124, SIXTEEN separate UTC-leakage
    points surfaced: mobile calendar (105), make-recurring default
    day (109), admin consent default + submit dates (111, 116),
    admin financials + audit-log CSV (112), API recurring cron (113),
    API CSV export + invoice overdue cron (114), admin promo
    validUntil (115), booking-cancellation slot waitlist lookup (117),
    recurring next-date math (118), CRITICAL provider matching
    weekday + time (119), receipt + invoice numbering + monthly
    billing (120), provider monthly-summary endpoint defaults (121),
    provider + admin "today" SQL stats (123, 13 query boundaries
    in one phase), pricing holidays + NBI expiry SQL (124).

    All thirteen shared the same root pattern: `new Date()` evaluated
    to UTC, then either `.toISOString().slice/split` for date
    strings, `getDay/getMonth/getDate/getFullYear/getHours` for
    component extraction, `setHours(0,0,0,0)` for "midnight today,"
    or `T...Z` ISO suffix for instants. Manila is +08:00, so every
    leak shifted boundaries by 8 hours. Since Manila day rolls over
    BEFORE UTC day, the Manila-day-AFTER-UTC window is when the
    bug bites — between 16:00 UTC and midnight UTC of any given
    day, Manila has rolled over but UTC hasn't.

    Every fix uses one of three shapes:
      - `toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })`
        → produces YYYY-MM-DD in Manila TZ, drop-in for places that
        previously called `.toISOString().slice(0, 10)` or
        `.toISOString().split('T')[0]`.
      - `T...+08:00` instead of `T...Z` → produces a Manila-anchored
        ISO instant, drop-in for places building ISO strings from a
        date input.
      - `new Date(`${manilaDay}T00:00:00Z`)` + `getUTC*` arithmetic
        → equivalent to Manila arithmetic since Manila is +08:00
        with no DST. Used by Phases 118 and 120 for month-rollover
        calc.

    Phase 119 was the highest blast radius (every match attempt
    for every booking ran through the broken code). Phase 120 was
    the highest stakes for compliance (BIR receipts and invoices
    are filed monthly and audited).

    Going forward, audit any `new Date()` near a date string OR
    near a `getDay/getMonth/getFullYear` for this pattern. The
    Manila launch market means UTC anchoring is almost always wrong.
    Setting `TZ=Asia/Manila` in the API container env would fix
    most of these at once, but is a behavioral change that affects
    everything; explicit Manila math is safer per call site.

---

## Phases 128–136 (2026-05-05, part 3) — addendum

Nine more phases. Same audit recipe applied to: dead-code clusters,
validators with TZ-naive refines, hardcoded city literals, and a
deep sweep of every Postgres timestamp comparison passing through a
YYYY-MM-DD bound. Every phase produced exactly one real bug or one
verified dead-code removal — no padding.

### Bugs found and fixed in 128–136

- **128 — mobile pricing cluster (4 files, 274 lines, 0 consumers)**
  Symmetric to Phase 126 (which removed 32 dead navigation routes).
  pricing.store.ts had zero consumers across 84 screens; its three
  only-used-by-the-store services (pricing, rebooking, slot-waitlist)
  were all dead too. The matching backend routes stay alive — they
  may be admin-consumed and are the v1.1 re-introduction surface.
  Same dead-code family as Phases 103/107/110/122/126.

- **129 — availabilityOverrideSchema "not in past" check used UTC-today**
  A provider on a Manila device opening the form during the 8-hour
  window between 00:00 Manila and 08:00 Manila could submit
  yesterday's Manila date and pass the validator (because UTC was
  still on yesterday). Same Manila TZ correction shape as Phases
  109/113/117/119/122/123/124. 7 boundary tests added.

- **130 — BIR calendar + financial-admin year defaults used UTC**
  Two compliance-adjacent admin views: BIR form calendar (1601-EQ,
  2550M, 1701Q, 1701) and the BIR reports overview default year.
  The calendar showed "overdue" 16 hours too early on every due-date
  (08:00 Manila on day-of, instead of 23:59). The default year
  fallback returned last year for 8 hours every Jan 1. Two bugs in
  one phase, same fix shape.

- **131 — booking-offer.service hardcoded "Boracay" in push notification**
  notifyProviderNewJob received a string literal `'Boracay'` as the
  city argument with a TODO comment "we'd pull from booking.city
  but offer service stays slim". For v1.0 (Boracay-only) this was
  technically correct most of the time, but admin-created test
  bookings or any v1.1 city expansion would have shown providers
  the wrong city. Three-line fix: add `city` to the SELECT, add to
  the interface, replace the literal with `bk.city`.

### Phases 132–136 — Postgres date-bound TZ sweep (5 phases, 5 bugs, 14 sites)

Phase 132 surfaced a third Manila-vs-UTC bug class beyond the JS
"`new Date()` for date math" pattern (Phases 109/113/etc) and the
Postgres `(now() AT TIME ZONE 'Asia/Manila')::date` pattern (Phase
123/124): comparing a `timestamptz` column against a YYYY-MM-DD
literal or `$N::date` cast. Postgres interprets such comparisons in
the session TZ (UTC), so admin filters like `from='2026-05-01' /
to='2026-05-31'` actually compared against 08:00 Manila boundaries.
On the to-side, `<= '2026-05-31'` was particularly bad: it excluded
16 hours of the to-day every query. Five surfaces hit:

- **132 — marketing analytics + campaign filters (4 sites)**
  listCampaigns + getMarketingOverview both had from/to filters with
  `started_at >= $N` / `started_at <= $N`. Admin's "May 2026"
  campaign report missed 00:00-08:00 Manila on May 1 AND
  08:00-23:59 Manila on May 31 (16 hours).

- **133 — audit-log filters (2 sites)**
  GET /api/v1/admin/audit-log + /audit-log/export.csv both had the
  same shape. For a regulatory-purpose compliance audit log this is
  the worst kind of bug: data was missing but the UI looked complete.
  DPO running a "May 2026" audit was silently dropping 16 hours of
  May 31 entries every time.

- **134 — provider monthly earnings (3 sites)**
  Three queries in getMonthlyEarnings (jobs, tips, payouts) all cast
  to `::date` without TZ. Provider's "May 2026" earnings statement
  was systematically mis-windowed by +8 hours: jobs confirmed at
  02:00 Manila on May 1 were excluded from May, jobs at 02:00 Manila
  on Jun 1 were wrongly included. Money-path adjacency.

- **135 — business-invoice period filter (1 site)**
  The JS-side correctly resolved the billing month from Manila wall-
  clock (Phase 118 fix), but the SQL filter in the period_bookings
  CTE then re-introduced the UTC bias on the same dates. Half-fixed
  bug — Phase 118 fixed the month resolution, Phase 135 fixed the
  remaining SQL filter on it.

- **136 — admin dashboard "today"/"ytd" boundaries (4 sites)**
  Different shape than 132–135: not a date literal but
  `DATE_TRUNC('day', NOW())` / `DATE_TRUNC('year', NOW())` truncating
  at session TZ. During the 8-hour window each Manila day between
  00:00 Manila and 08:00 Manila, "today" actually meant
  "yesterday-Manila" — an admin opening the dashboard at 06:00 AM
  saw "today's revenue" that included yesterday's 16:00-23:59 Manila
  revenue and excluded the night's 00:00-06:00 Manila revenue.
  Phase 124 fixed only the NBI-expiry filter; Phase 136 closes the
  larger dashboard gap. Helper SQL constants
  `MANILA_DAY_START_SQL` and `MANILA_YEAR_START_SQL` introduced.

### Pattern #20 — three Manila-vs-UTC fix shapes for Postgres

The 132–136 sweep adds a fourth canonical fix shape to pattern #19,
specifically for Postgres `timestamptz` comparisons:

```sql
-- Old (UTC-anchored):
col >= 'YYYY-MM-DD'                            -- UTC midnight
col <= 'YYYY-MM-DD'                            -- UTC midnight + excludes whole day
col >= $N::date                                 -- UTC midnight (session TZ)
DATE_TRUNC('day', NOW())                       -- UTC midnight today
DATE_TRUNC('year', NOW())                      -- UTC midnight Jan 1

-- New (Manila-anchored, half-open):
col >= ($N::date AT TIME ZONE 'Asia/Manila')                      -- Manila midnight inclusive
col <  (($N::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Manila') -- Manila midnight next-day exclusive
DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'
DATE_TRUNC('year', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'
```

The `<` half-open replacement for `<=` is critical: `<= 'YYYY-MM-DD'`
matches only midnight of the to-day, excluding 23h59m of it. The
fix shape uses `<` against next-day-midnight to include the whole
to-day Manila.

Going forward, `grep -nE '_at\s*(>=|<=)\s*\$' src/` and `grep
"DATE_TRUNC.*NOW\(\)"` are the two queries that surface remaining
instances of this bug class.

### Test count progression in this segment

- After Phase 127: API 2590, mobile 535, admin 135
- After Phase 128: mobile 541 (+6, was 535)
- After Phase 129: API 2597 (+7)
- After Phase 130: API 2604 (+7)
- After Phase 131: API 2609 (+5)
- After Phase 132: API 2615 (+6)
- After Phase 133: API 2621 (+6)
- After Phase 134: API 2625 (+4)
- After Phase 135: API 2629 (+4)
- After Phase 136: API 2636 (+7)

All three packages tsc-clean throughout. No regressions. 9 phases,
9 atomic commits (45862ac → e756f66), 9 real bugs / dead-code
removals.

---

## Phases 137–140 (2026-05-05, part 4) — TZ sweep continuation

Four more phases extending the Phase 132–136 sweep to every
remaining Postgres date-bound site that wasn't already Manila-
anchored. Same fix-shape, more surfaces:

- **137 — admin revenue-trend bucket labels (4 sites in 1 query)**
  getRevenueTrend daily series boundaries + per-day GMV/revenue
  bucket labels all used bare DATE_TRUNC, so each trend point
  labeled "2026-05-01" actually spanned 08:00 Manila May 1 →
  08:00 Manila May 2 (a 24-hour window shifted +8 hours from the
  real Manila day). Phase 136 fixed the single-number KPI cards;
  Phase 137 closes the trend-line bucket labeling.

- **138 — admin cohort analysis month buckets (6 sites)**
  Retention + revenue cohorts both used DATE_TRUNC('month', ...) at
  session TZ. A user signing up at 03:00 Manila on May 1 was
  bucketed into the April cohort instead of May. Every 1st-of-month
  between 00:00 and 08:00 Manila had 8 hours of signups attributed
  to the wrong cohort, biasing every retention curve.

- **139 — financial-admin dashboard 8-site sweep**
  EIGHT date-bound query sites across 6 functions (getOverview,
  getRevenueByCategory, getCommissionTrend, getRefundsTrend,
  getPayoutsBreakdown, getTopProviders) plus today_completed
  cells in getPayoutsTab plus OR-search issued_at. All 8 sites
  cast `$N::date` without TZ anchor — every financial dashboard
  tab misreported by the same +8h shift, with 16-hour to-day
  blind spots like the marketing/audit-log bug.

- **140 — provider quality scoring 90-day window (2 sites)**
  Lower-severity rolling-window analytics. Manila-anchored for
  consistency.

Combined Phase 132–140 sweep: **9 phases, 9 bugs, 38 query sites
fixed**, all sharing one root cause and one fix shape. The
Postgres `timestamptz`-vs-date-literal bug class is now closed in
the API.

### Test count progression in this segment

- After Phase 136: API 2636
- After Phase 137: API 2641 (+5)
- After Phase 138: API 2646 (+5)
- After Phase 139: API 2652 (+6)
- After Phase 140: API 2655 (+3)

All three packages tsc-clean throughout. No regressions.

---

## Phases 141–144 (2026-05-05, part 5) — non-TZ admin/mobile sweep

After the 132-140 Postgres timestamptz sweep closed the date-bound
filter bug class, attention shifted to two other audit angles:
client/server validation mismatches in admin pages, and missing
mobile screens for declared API endpoints.

- **141 — pricing-rule holidayDate rendered as long timestamp**
  Found while deep-auditing PricingRulesPage.tsx (683 lines, not
  previously deep-audited). pricing.service.ts:formatPricingRule
  did `String(r.holiday_date).split('T')[0]` to convert the DATE
  column for the front-end. Pg-node's default DATE parser returns
  a JS Date object, and `String(date)` calls `Date.prototype.toString()`
  which returns runtime-local human format like
  "Fri Dec 25 2026 00:00:00 GMT+0800 (Singapore Standard Time)".
  Splitting that on 'T' splits inside the timezone label
  ("Standard **T**ime"), returning garbage. The admin Pricing Rules
  table cell rendered the long human string instead of "2026-12-25".
  Fix: normalize via `new Date(...).toISOString()` which emits a
  real ISO-8601 'T'.

- **142 — BookingDetailPage force-complete client gate (10) was
  looser than server (20)**
  Same client/server validation-mismatch pattern as Phase 77-02
  (cancel was 5/10). Super-admin actions panel gated all five
  mutations behind a single `reasonOk = >= 10` check. That works
  for 4 of the 5 actions. But forceCompleteBooking server requires
  20 chars. So a 10-19 char reason passed client, hit server, got
  generic 400. Added separate `reasonOkForce = >= 20` gate plus
  branching label hint that surfaces the higher bar.

- **143 — DisputeDetailPage reopen client gate (10) was looser
  than server (20)**
  Same shape as 142 — a different super-admin action with the
  same broken gate. After Phase 142 + 143, all client/server
  reason-length gates in the admin app match.

- **144 — E04 escalation: provider has no in-app way to respond
  to disputes**
  Mobile blind spot. The dispute lifecycle has 3 endpoints:
  customer files (mobile screen exists), provider responds (mobile
  screen MISSING), admin resolves (admin screen exists). With no
  provider response screen, every dispute auto-resolves in the
  customer's favor after 48 hours regardless of merit. Three options
  documented at .ai-coder/escalations/E04-... ; recommendation is
  Option A (build the screen, ~4-6h scope).

  Same blind-spot pattern as Phase 121 (provider monthly summary
  route had no UI — caught because the API existed but no consumer).

### Test count progression in this segment

- After Phase 140: API 2655, Admin 135
- After Phase 141: API 2660 (+5)
- After Phase 142: Admin 140 (+5)
- After Phase 143: Admin 144 (+4)
- After Phase 144: no test (escalation only)

Final: API 2660, Mobile 541, Admin 144 — all green, all tsc-clean.

---

## Phases 145–148 (2026-05-05, part 6) — mobile maxLength sweep

Four more phases sweeping every customer-facing mobile text input
that hits a server `.max(N)` validator. Pattern: input had no
maxLength, hint sometimes implied a cap that wasn't enforced, user
could type past the cap, server returned generic 400 at submit.

- **145 — review comment + privateNote (2 sites)**
  Hint said "X / 1000 characters" but no maxLength. Server caps
  at 1000 (review.validators.ts:19,24).

- **146 — booking notes + 2 cancel-reason inputs (3 sites)**
  Booking form Notes had no maxLength (server max 2000).
  Customer + provider cancel-reason TextInputs had no maxLength
  (server cancellationReason.max(500)).

- **147 — register + profile First/Last Name (4 sites)**
  Both screens had identical First Name + Last Name input pairs
  with no maxLength. Server caps at max(100) per field
  (auth.validators.ts:76-77).

- **148 — addresses screen 5-field form**
  fullAddress, barangay, city, province, notes — all five
  TextInputs missing maxLength. Server caps respectively at
  500/100/100/100/500 (address.validators.ts:13-22).

**Combined Phase 145-148 sweep:** 4 phases, 4 bugs, 14 input sites
fixed. After this segment, every customer-facing form input on
mobile that hits a server-side `.max(N)` validator has matching
client-side maxLength. The unbounded-input bug class is closed
across the customer-side mobile app.

### Test count progression

- After Phase 144: API 2660, Mobile 541, Admin 144
- After Phase 145: Mobile 545 (+4)
- After Phase 146: Mobile 551 (+6)
- After Phase 147: Mobile 557 (+6)
- After Phase 148: Mobile 563 (+6)

Final: API 2660, Mobile 563, Admin 144 — all green, all tsc-clean.

Total commits since Phase 127 closeout (f9e8d95): **26**
(20 bug fixes + 1 escalation + 5 closeout-doc updates).

---

## Phases 149–150 (2026-05-05, part 7) — provider mobile maxLength sweep complete

Two more phases finishing the maxLength sweep on the provider side:

- **149 — provider-onboarding inputs (3 sites)**
  businessName (server max 200), City + Province (each max 100).
  Server: providerApplicationSchema (provider.validators.ts:23-30).

- **150 — provider availability overrideReason (1 site)**
  Final unbounded input on the provider side. Server cap max(500)
  per availabilityOverrideSchema (provider.validators.ts:76).

**Combined Phase 145-150 sweep total:** 6 phases, 6 bugs, 18 input
sites fixed across both customer and provider mobile flows. Every
mobile text input that hits a server `.max(N)` validator now has
matching client-side maxLength. The unbounded-input bug class is
now closed across the entire mobile app.

### Final test counts

API: 211/211 suites, 2660/2660 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **29**
(22 bug fixes + 1 escalation + 6 closeout-doc updates).

---

## Phase 151 (2026-05-06, part 8) — completion notes silent-strip end-to-end fix

One more silent-strip fix in the same MED-N85 family as Phase 127.

**151 — provider job-completion notes were silently dropped end-to-end (5 layers)**

The mobile provider job-completion screen had a "Notes (optional)"
textarea that submitted as `notes` in the PATCH /bookings/:id/status
body. Five layers all conspired to make the notes theatrical:

  Mobile: sends `notes`
  ↓
  Validator: updateBookingStatusSchema didn't declare `notes`
    → Zod stripped it (default-strip behavior)
  ↓
  Service: transitionBookingStatus(... cancellationReason)
    → no notes parameter
  ↓
  bookings.completion_notes column: didn't exist
  ↓
  Provider notes: theatrical, never persisted

Provider completion notes are the canonical in-app dispute-defense
audit trail ("customer was satisfied, signed in person, see attached
photos"). Without persistence, providers had no defense when a
customer filed a frivolous dispute later. Launch-relevant given E04
(provider can't respond to disputes) is still pending Ken's call.

Fix landed in 5 layers in one commit:
  1. Migration 126 — `bookings.completion_notes TEXT` (nullable;
     no backfill needed; safe ADD COLUMN per CLAUDE.md hard-stop rules)
  2. Validator — declares `completionNotes: z.string().max(2000).optional()`
  3. Service — accepts + persists when newStatus = 'completed_by_provider'
  4. Route — forwards req.body.completionNotes to the service
  5. Mobile — renames `notes` → `completionNotes` in the PATCH body

Same multi-layer fix shape as Phase 127 (device-fingerprint binding).

### Final test counts after Phase 151

API: 212/212 suites, 2668/2668 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **31**
(23 bug fixes + 1 escalation + 7 closeout-doc updates).

---

## Phases 152–154 (2026-05-06, part 9) — server-side input cap sweep

After the mobile maxLength sweep (Phase 145-150) closed the
unbounded-input bug class on the client side, three more phases
closed it on the server side — defense-in-depth pattern matching
MED-N97 (file:// URI rejection):

- **152 — provider portfolio + certification routes (5 sites)**
  POST/PATCH /me/portfolio caption + categoryId, plus POST/PATCH
  /me/certifications name/issuingBody/certificateNumber. All
  customer-facing surfaces (public provider profile); unbounded
  values were both UX hazard and sneak-injection vector.

- **153 — promotion routes (12 sites across POST + PUT)**
  6 fields × 2 routes — title, subtitle, imageUrl, badge, ctaText,
  ctaLink, plus targetAudience enum check + displayOrder integer
  check. Promotions surface on the customer home banner and
  provider dashboard; admin-supplied content needed length caps
  for both UX safety and Postgres-error-friendliness (raw SQL
  constraint errors → friendly 400s).

- **154 — checklist notes + support resolutionNotes (2 sites)**
  Two more TEXT-column inputs with no caps. Checklist notes
  surface in admin BookingDetail dispute review; resolutionNotes
  surface in customer ticket history.

**Combined Phase 152-154 sweep:** 3 phases, 3 bugs, 19 input sites
fixed. Same fix shape across all of them — explicit length checks
in the route or service handler that throw a friendly 400 when
oversized. Pattern #22 (server-side caps as defense-in-depth)
formally established.

After Phase 145-150 (client-side) + Phase 152-154 (server-side),
both sides of every text-input contract on the platform now
match. A misbehaving client gets a friendly 400; a well-behaved
client gets a maxLength prop that stops them at the cap; the
column itself is also bounded where the type allows. Three
defenses in depth.

### Final test counts after Phase 154

API: 215/215 suites, 2688/2688 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **35**
(26 bug fixes + 1 escalation + 8 closeout-doc updates).

---

## Phases 155–156 (2026-05-06, part 10) — server cap sweep extended

Two more server-side cap fixes extending the Phase 152-154 sweep:

- **155 — public waitlist endpoint (6 sites)**
  POST /api/v1/service-areas/waitlist is PUBLIC (no auth — anyone
  on the internet can hit it). Rate-limited but had no length
  validation on its 6 fields. Highest-priority of the sweep
  because of the public-attacker exposure. Caps mirror migration
  022_service_areas.sql VARCHAR types.

- **156 — account deletion reason (1 site)**
  POST /api/v1/account/deletion accepted unbounded `reason`.
  Column is TEXT (unbounded by Postgres). Capped at 1000 chars.

**Cumulative server-cap sweep (Phases 152-156):** 5 phases, 5 bugs,
**33 server-side input sites** capped. Combined with the mobile
maxLength sweep (Phases 145-150, 18 sites), every text-input
contract on the platform now has matching cap discipline at every
layer (mobile → server → DB).

### Final test counts after Phase 156

API: 217/217 suites, 2695/2695 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **39**
(28 bug fixes + 1 escalation + 10 closeout-doc updates).

---

## Phases 157–158 (2026-05-06, part 11) — final server cap entries

Two more server-side cap fixes finishing the sweep:

- **157 — push token cap (1 site)**
  POST /api/v1/notifications/push-token accepted unbounded `token`.
  push_tokens.token is TEXT — Postgres has no DB-side cap. Real
  push tokens are well-bounded (APNs 64, FCM 150-200, Expo 50-80).
  Cap: 256.

- **158 — DPA breach-log routes (3 sites)**
  Three TEXT columns missing caps on DPO-only routes:
    scope                — POST / (cap 2000)
    npc_reference        — POST /:id/notify-npc (cap 100)
    remediation_summary  — PATCH /:id/status (cap 5000)
  DPO-only access reduces attack surface but doesn't eliminate it
  (compromised token, accidental paste, internal vector).

**Final cumulative server-cap sweep (Phases 152-158):** 7 phases,
7 bugs, **37 server-side input sites** capped. Combined with the
mobile maxLength sweep (Phases 145-150, 18 sites), every text-input
contract on the platform now has cap discipline at every layer.

### Final test counts after Phase 158

API: 219/219 suites, 2703/2703 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **42**
(30 bug fixes + 1 escalation + 11 closeout-doc updates).

---

## Phase 159 (2026-05-06, part 12) — admin decide reason max caps

One more entry in the server-cap sweep.

**159 — admin decision services had min(30) but no max on reason (2 sites)**
  Two admin "decide" services validated reason >= 30 chars but
  had no max cap:
    - provider-onboarding.service.ts adminDecide
      (column: admin_decision_reason TEXT)
    - service-area-change.service.ts decide
      (column: decision_reason TEXT)
  Both are super_admin gated, but defense-in-depth still applies.
  Cap at 5000 chars.

**Cumulative server-cap sweep total (Phases 152-159):** 8 phases,
8 bugs, **39 server-side input sites** capped. Combined with the
mobile maxLength sweep (Phases 145-150, 18 sites), every text-input
contract on the platform has cap discipline at every layer.

### Final test counts after Phase 159

API: 220/220 suites, 2707/2707 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **44**
(31 bug fixes + 1 escalation + 12 closeout-doc updates).

---

## Phase 160 (2026-05-06, part 13) — final reason-max sweep entry

**160 — customer/provider admin reason fields min(5) but no max (3 sites)**
  Three super-admin services had min(5) reason but no max cap.
  All persist to admin_actions.reason (TEXT, unbounded):
    - customer-admin.service.ts updateCustomerStatus
    - customer-admin.service.ts creditCustomerWallet
    - provider-admin.service.ts adjustProviderWallet
  Same defense-in-depth pattern as Phase 152-159. Cap at 2000.

**Cumulative server-cap sweep total (Phases 152-160):** 9 phases,
9 bugs, **42 server-side input sites** capped. Combined with the
mobile maxLength sweep (Phases 145-150, 18 sites), every text-input
contract on the platform has cap discipline at every layer.

### Final test counts after Phase 160

API: 221/221 suites, 2710/2710 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **47**
(32 bug fixes + 1 escalation + 14 closeout-doc updates).

---

## Phase 161 (2026-05-06, part 14) — DSR userMessage cap

**161 — DSR userMessage had no server cap (1 site)**
  POST /api/v1/compliance/dsr accepted unbounded user_message.
  Column is TEXT (migration 057 data_subject_requests.user_message).
  Customer-facing, authenticated but rate-limited.
  Cap at 5000 chars.

**Cumulative server-cap sweep total (Phases 152-161):** 10 phases,
10 bugs, **43 server-side input sites** capped. Combined with the
mobile maxLength sweep (Phases 145-150, 18 sites), every text-input
contract on the platform has cap discipline at every layer.

### Final test counts after Phase 161

API: 222/222 suites, 2712/2712 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **49**
(33 bug fixes + 1 escalation + 15 closeout-doc updates).

---

## Phase 162 (2026-05-06, part 15) — business reason caps

**162 — business removeMember + transferOwnership reason caps (2 sites)**
  Two business-account services accepted unbounded `reason`. Both
  customer-facing (business owner/manager invokes), with role checks
  already in place but no length validation. Cap at 1000 chars.

**Cumulative server-cap sweep total (Phases 152-162):** 11 phases,
11 bugs, **45 server-side input sites** capped. Combined with the
mobile maxLength sweep (Phases 145-150, 18 sites), every text-input
contract on the platform has cap discipline at every layer.

### Final test counts after Phase 162

API: 223/223 suites, 2714/2714 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **51**
(34 bug fixes + 1 escalation + 16 closeout-doc updates).

---

## Phase 163 (2026-05-06, part 16) — catalog server caps

**163 — catalog services had no server-side length validation (12+ sites)**
  Six catalog mutations (categories, subcategories, addons —
  create + update each) had no length validation on name/
  description/iconUrl. Mixed columns: name VARCHAR(100) (DB cap →
  raw SQL error), description + icon_url TEXT (unbounded).
  Service-level validation gives friendly 400 errors and protects
  unbounded TEXT.
  Caps: name 100, description 2000, iconUrl 500.

**Cumulative server-cap sweep total (Phases 152-163):** 12 phases,
12 bugs, **57+ server-side input sites** capped. Combined with the
mobile maxLength sweep (Phases 145-150, 18 sites), every text-input
contract on the platform has cap discipline at every layer.

### Final test counts after Phase 163

API: 224/224 suites, 2718/2718 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **53**
(35 bug fixes + 1 escalation + 17 closeout-doc updates).

---

## Phase 164 (2026-05-06, part 17) — provider note delete reason cap

**164 — provider-admin deleteProviderNote reason cap (1 site)**
  Column is TEXT (deleted_reason; migration 076). Cap at 1000.

**Cumulative server-cap sweep total (Phases 152-164):** 13 phases,
13 bugs, **58+ server-side input sites** capped.

### Final test counts after Phase 164

API: 225/225 suites, 2720/2720 tests
Mobile: 129/129 suites, 569/569 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **55**
(36 bug fixes + 1 escalation + 18 closeout-doc updates).

---

## Phases 165–166 (2026-05-06, part 18) — final mobile + public-search caps

**165 — account-management deletion reason maxLength on customer + provider (2 sites)**
  Mobile inputs let users type unbounded text → 400 from server
  at submit. Server caps at 1000 (Phase 156). Mobile match.

**166 — public /catalog/search had no upper bound (2 sites — server + mobile)**
  PUBLIC endpoint (no auth). ILIKE on three columns + provider join
  was wasteful with a 100,000-char query. Cap at 100 (real human
  searches). Mobile match: maxLength={100} on search input.

**Cumulative server-cap sweep total (Phases 152-166):** 15 phases,
15 bugs, **62+ server-side input sites** capped. Combined with the
mobile maxLength sweep (Phases 145-150 + 165-166, 22 sites), every
text-input contract on the platform has cap discipline at every layer.

### Final test counts after Phase 166

API: 226/226 suites, 2723/2723 tests
Mobile: 130/130 suites, 572/572 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **58**
(38 bug fixes + 1 escalation + 19 closeout-doc updates).

---

## Phases 167–168 (2026-05-06, part 19) — full_notes cap entries

**167 — catalog deleteSubcategory + deleteAddon reason cap (2 sites)**
  Both services slice reason at 500 for admin_actions.reason but
  pass the full string to admin_actions.full_notes (TEXT, unbounded).
  Cap reason at 2000.

**168 — booking-admin requireReason helper had no max cap (1 helper, 5 callers)**
  One-line fix in the requireReason helper caps all 5 booking-admin
  actions at once: manualReleaseEscrow, refundFromEscrow,
  reassignBookingProvider, cancelBookingAsAdmin, forceCompleteBooking.
  Cap at 5000 (covers force-complete's 20-char min + room for
  dispute-defense narratives).

**Cumulative server-cap sweep total (Phases 152-168):** 17 phases,
17 bugs, **65+ server-side input sites** capped (with the helper
fix in 168 covering 5 callers via 1 site).

### Final test counts after Phase 168

API: 228/228 suites, 2728/2728 tests
Mobile: 130/130 suites, 572/572 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **61**
(40 bug fixes + 1 escalation + 20 closeout-doc updates).

---

## Phase 169 (2026-05-06, part 20) — first non-cap UX-gap fix in the recent run

After 17 phases of cap-sweep work (152-168), Phase 169 is a return
to the screen-level audit work that started this whole sequence:

**169 — customer home Active Booking card hid 2nd+ bookings (1 site)**
  apps/mobile/app/(tabs)/home.tsx Active Booking section was
  hardcoded singular ("Active Booking") and `slice(0, 1)`-capped —
  only ever showed the FIRST active booking. If a customer had 2+
  active bookings (paid booking with provider en route AND a matched
  booking waiting), the second was invisible from home.
  
  Fix: show up to 3 active bookings, section title pluralizes,
  "See all >" link when count > 3.

  Real UX gap, not a server-side bug. Same kind of "missing things
  the screen is supposed to do" the user explicitly called out.

### Final test counts after Phase 169

API: 228/228 suites, 2728/2728 tests
Mobile: 131/131 suites, 577/577 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **63**
(41 bug fixes + 1 escalation + 21 closeout-doc updates).

---

## Phases 170–171 (2026-05-06, part 21) — UX-gap + last maxLength

Continuing the return to screen-level audit work:

**170 — customer bookings tab empty state had no CTA**
  Empty state showed "No bookings yet" with no path forward — a
  new customer would have to navigate back to (tabs)/home to find
  the categories. Now: "Browse Services" CTA on the all-filter
  empty state. Same UX-gap family as Phase 169.

**171 — provider withdraw account Input missing maxLength={255}**
  Server's withdrawalSchema caps destinationAccount at 255. Mobile
  Input had no maxLength. Same fix shape as Phase 145-150 sweep.

### Final test counts after Phase 171

API: 228/228 suites, 2728/2728 tests
Mobile: 133/133 suites, 581/581 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **66**
(43 bug fixes + 1 escalation + 22 closeout-doc updates).

---

## Phase 172 (2026-05-06, part 22) — third consecutive UX-gap fix

**172 — provider Payout History screen had no Withdraw CTA (1 site)**
  Provider opening Payout History to check their last payout had
  to navigate back to (provider-tabs)/earnings to request a new
  withdrawal. Same UX-gap family as Phase 169 (home active bookings
  hidden) and Phase 170 (bookings empty CTA).
  
  Fix: "Withdraw" CTA button in the Payout History header.

Phases 169 + 170 + 172 form a small streak of screen-level UX-gap
fixes — the user's "missing things the screen is supposed to do"
pattern.

### Final test counts after Phase 172

API: 228/228 suites, 2728/2728 tests
Mobile: 134/134 suites, 583/583 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **68**
(44 bug fixes + 1 escalation + 23 closeout-doc updates).

---

## Phases 173–174 (2026-05-06, part 23) — UX-gap streak continues

**173 — customer recurring index empty state had no CTA**
  Empty state hint said "After completing a booking, you can set
  it to repeat automatically" but no link. Browse Services CTA added.

**174 — customer suki-pros empty state had no CTA**
  Empty state hint said "Complete bookings with the same provider"
  but no link. Browse Services CTA added.

Phases 169 + 170 + 172 + 173 + 174 form a **5-phase UX-gap streak**.
The "missing things the screen is supposed to do" pattern called
out by the user is now systematically being closed across customer-
facing screens.

### Final test counts after Phase 174

API: 228/228 suites, 2728/2728 tests
Mobile: 136/136 suites, 587/587 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **71**
(46 bug fixes + 1 escalation + 24 closeout-doc updates).

## Phases 175–177 (2026-05-06, part 24) — UX-gap streak extends to 8

**175 — provider Jobs tab empty state had no helper text**
  Empty state on `(provider-tabs)/jobs.tsx` was just an icon + bare
  "No active jobs" / "No completed jobs yet" / "No cancelled jobs"
  text. The Dashboard explains "Go online to start receiving jobs"
  but the Jobs tab itself didn't echo that — providers landing here
  directly were left wondering why they had no jobs. Now: filter-
  conditional helper hint under each empty state.

  - active: "Make sure you're online (toggle on the Dashboard) and
    have services configured. New job requests will appear here."
  - completed: "Completed jobs will show here after the customer
    confirms or after the auto-confirm window passes."
  - cancelled: "Cancelled jobs will appear here."

**176 — customer search empty state had no Browse CTA**
  Hint said "Try a different keyword or browse categories" — but
  "browse categories" was just text, no link. A customer who
  searched and got zero results had to back out manually. Now:
  Browse Categories CTA routes to `/(tabs)/home`.

**177 — wallet empty state was filter-blind**
  Empty state always said "No transactions yet" regardless of
  whether the user genuinely had no history or just selected a
  filter (Top-ups / Payments / Refunds) that returned zero from
  the in-memory list. Misleading: a user with 5 payments switching
  to "Top-ups" saw "No transactions yet" — looked like the whole
  wallet was empty. Now: filter-aware text — distinguishes truly-
  empty ("No transactions yet" + "Top up your wallet or pay for a
  booking..." hint) from filter-empty ("No top-ups in this view" /
  "No payments in this view" / "No refunds in this view").

Phases 169 + 170 + 172 + 173 + 174 + 175 + 176 + 177 form an
**8-phase UX-gap streak**.

### Final test counts after Phase 177

API: 228/228 suites, 2728/2728 tests
Mobile: 139/139 suites, 597/597 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **75**
(49 bug fixes + 1 escalation + 25 closeout-doc updates).

## Phases 178–181 (2026-05-06, part 25) — UX-gap streak extends + server-cap sweep resumes

**178 — provider+customer notifications empty states had no helper text**
  Both notifications screens (`provider/notifications.tsx`,
  `customer/notifications.tsx`) had a bare "No notifications yet"
  empty state with no helper text — users landing here didn't know
  what kinds of notifications would arrive. Now both have a one-line
  hint:
  - provider: "Job offers, payment releases, reviews, and tier
    updates will appear here."
  - customer: "Booking updates, provider arrivals, quotes, and
    promos will appear here."
  Two separate fix-comment IDs (BUG-PHASE178-01 / 02) since the two
  screens are distinct files; one shared regression test file covers
  both.

**179 — decline-offer reason silently truncated to 500 chars**
  Pre-fix POST /api/v1/bookings/offers/:offerId/decline accepted
  any-length reason and the service did `.slice(0, 500)` before
  persisting to decline_reason. A 10000-char abuse string was
  silently truncated; client got 200 OK with no signal. Now: explicit
  DECLINE_REASON_MAX = 500 cap at the route boundary returns 400
  with a helpful message.

**180 — DSR action routes silently truncated overlong text (3 sites)**
  Three DSR action routes in compliance-admin.routes.ts accepted
  unbounded text:
  - POST /dsr/:id/request-info (infoNeeded)
  - POST /dsr/:id/reject (reason)
  - POST /dsr/:id/escalate (npcReference)
  The service then did `.slice(0, 500)` for the user-facing
  notification while storing the full string in admin_notes / JSON
  details. A 100k-char abuse string would balloon admin_notes while
  the DSR subject saw a 500-char excerpt. Now: validateDsrText helper
  caps infoNeeded + reason at 5000; npcReference capped at 200 (it's
  just an external case ID).

**181 — admin-latent decide routes accepted unbounded reason (2 sites)**
  POST /admin/provider-applications/:userId/decide and POST /admin/
  service-area-changes/:changeId/decide both accepted unbounded
  reason strings that flow into admin_actions audit rows + user
  notifications. Now: validateDecideReason helper caps reason at
  5000.

Phases 179 + 180 + 181 are the **server-cap sweep resuming** — same
shape as Phase 152-168. Six route-level caps added across three files,
4 helper functions added. Detection pattern: `req.body.X` reads of
text fields that flow into the database without an explicit length
gate at the route boundary.

UX-gap streak now **9 phases** (Phases 169 + 170 + 172 + 173 + 174 +
175 + 176 + 177 + 178), with Phase 178 contributing 2 separate fixes.

### Final test counts after Phase 181

API: 231/231 suites, 2740/2740 tests
Mobile: 139/139 suites, 597/597 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **80**
(53 bug fixes + 1 escalation + 26 closeout-doc updates).

## Phases 182–186 (2026-05-06, part 26) — UX-gap streak + Manila-TZ sweep round 2

**182 — recurring detail history empty had no hint**
  Customer recurring/[id].tsx "View History" toggle empty state
  ("No instances yet.") was bare. Now: hint "Past bookings will
  appear here once they are completed."

**183 — provider services empty had no embedded CTA**
  Empty state on provider/services.tsx had a hint but the "+ Add
  Service" button rendered AFTER the empty state. Now: an "Add Your
  First Service" CTA inline.

**184 — customer category empty was a dead-end**
  customer/category/[id].tsx empty state ("No services available in
  this category.") had no path forward — only the back button. Now:
  hint about providers coming online + "Browse Other Categories" CTA.

UX-gap streak now **10 phases** (Phases 169 + 170 + 172 + 173 + 174
+ 175 + 176 + 177 + 178 + 182-184).

**185 — provider quality-score period boundary off by 1 Manila day**
  computeProviderQualityScores used new Date().toISOString().split(
  'T')[0] for the period start/end, which returns the UTC date. The
  SQL filter then `AT TIME ZONE 'Asia/Manila'` interpreted that date
  string as Manila midnight. For the 8-hour window 16:00-23:59 UTC
  (= 00:00-07:59 Manila next day), the JS-side date was still
  yesterday-Manila, so the period boundary was off by one Manila
  day. Same pattern as Phase 119-124. Now: Intl.DateTimeFormat
  en-CA + timeZone Asia/Manila for the date strings.

**186 — invoice service_date used UTC-anchored date**
  Invoice items recorded service_date via scheduledAt.toISOString().
  split('T')[0]. For early-Manila-morning bookings (00:00-07:59
  Manila = 16:00-23:59 UTC the day before), the customer who booked
  "May 4 02:00 AM" saw the invoice line read service_date 2026-05-03
  — off by one Manila day. Same Manila-TZ pattern. Now: format the
  date in Asia/Manila via Intl.DateTimeFormat en-CA.

**187 — provider monthly-summary breakdown date used UTC**
  computeMonthlySummary recorded each booking's confirmed/completed
  date via dateValue.toISOString().split('T')[0]. For early-Manila-
  morning confirmations, the provider saw the breakdown row's date
  one day earlier than the wall-clock date the customer confirmed
  at. Same Manila-TZ pattern. Now: format dateValue in Asia/Manila
  via Intl.DateTimeFormat en-CA.

Phases 185 + 186 + 187 are the **Manila-TZ sweep resuming** — same
shape as Phase 119-124 + Phase 132-140. Three more UTC-vs-Manila
boundary bugs found by sweeping `.toISOString().split('T')[0]`
patterns that were never anchored to Manila.

### Final test counts after Phase 187

API: 234/234 suites, 2748/2748 tests
Mobile: 143/143 suites, 611/611 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **88**
(59 bug fixes + 1 escalation + 28 closeout-doc updates).

## Phase 188 (2026-05-06, part 27) — server-cap sweep extends to validator-missing routes

**188 — complete-payout route had no Zod validator**
  PUT /api/v1/payouts/:id/complete read req.body.paymongoTransferId
  without bounds or type-check, then passed it straight to
  completePayout() which wrote it into paymongo_transfer_id. A
  malicious super_admin (or a misconfigured PayMongo callback) could
  bloat the column with megabytes of garbage; a non-string would also
  slip through. Now: completePayoutSchema with paymongoTransferId as
  z.string().max(100).optional() wired via validationMiddleware.

Same server-cap shape as Phase 152-168 + Phase 179-181. Detection
pattern: `req.body.X` reads on routes WITHOUT a validationMiddleware
attached.

### Final test counts after Phase 188

API: 235/235 suites, 2753/2753 tests
Mobile: 143/143 suites, 611/611 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **90**
(60 bug fixes + 1 escalation + 29 closeout-doc updates).

## Phases 189–191 (2026-05-06, part 28) — server-cap sweep finishing pass

**189 — admin updateProviderProfile had no text caps**
  PATCH /admin/providers/:id/profile accepted unbounded businessName
  + description. businessName column is VARCHAR(200) (Postgres would
  5xx on overlong) and description is TEXT (unbounded). Now: explicit
  caps in the service — businessName ≤ 200, description ≤ 5000.

**190 — recurring booking cancel reason was uncapped**
  cancelRecurringBooking accepted optional reason and passed it
  straight to recurring_bookings.cancellation_reason (TEXT). The
  route had no Zod validator. Now: 500-char cap (mirrors booking
  cancellationReason).

**191 — dispute-admin requireText helper had no max cap**
  Used by adminResolveDispute (decisionNotes), sendDisputeMessage
  (message), adminEscalateDispute (reason). All flow into TEXT
  columns (admin_actions.full_notes, dispute_messages.message,
  disputes.escalation_reason). Now: REQUIRE_TEXT_MAX = 5000 cap
  (matches Phase 168 booking-admin requireReason cap).

These three close the remaining holes in the server-cap sweep that
started at Phase 152. The pattern is now exhausted across the api/
src/{routes,services} surface — every external-input text field
either has a Zod validator at the route boundary or an explicit
length cap in the service helper.

### Final test counts after Phase 191

API: 238/238 suites, 2761/2761 tests
Mobile: 143/143 suites, 611/611 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **94**
(63 bug fixes + 1 escalation + 30 closeout-doc updates).

## Phase 192 (2026-05-06, part 29) — server-cap sweep extends to B2B onboarding

**192 — createBusinessAccount had no text caps (8 fields)**
  Pre-fix POST /business-accounts had no Zod validator and the
  service had no length validation on 8 text fields:
  - companyName, contactPerson (VARCHAR(200))
  - contactEmail (VARCHAR(255))
  - registrationNumber (VARCHAR(100))
  - taxId (VARCHAR(50))
  - contactPhone (VARCHAR(20))
  - billingAddress, notes (TEXT — unbounded)

  Now: explicit caps in the service matching column widths plus
  sensible TEXT-field caps (billingAddress 1000, notes 5000). The
  earlier "server-cap sweep is exhausted" claim from Phase 191 was
  premature — business.service.ts had this hole still.

### Final test counts after Phase 192

API: 239/239 suites, 2770/2770 tests
Mobile: 143/143 suites, 611/611 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **96**
(64 bug fixes + 1 escalation + 31 closeout-doc updates).

## Phases 193–195 (2026-05-06, part 30) — missing-functionality + lying-error sweep

The user's instruction was explicit: "what's the screen supposed to
have on it and actually do should be thought about, reasoned through,
checked if that's all there and working. is something missing.
what's missing?" These three phases are the first round applying
that lens to deeper audit candidates.

**193 — tip screen missing optional message input (real missing-feature)**
  The tip screen UI had no message field, but the FULL stack already
  supported one:
  - POST /api/v1/tips Zod validator: message: z.string().max(500).optional()
  - tips.message column persists the value
  - Provider's "Tip Received" notification body uses the message
  Customer had no way to say "thanks for the great service!" — exactly
  the missing-UX pattern the user called out. Now: optional message
  input below tip preview, capped at 500, with live char counter.

**194 — provider complete-job notes had no maxLength (UX desync)**
  Server-side completionNotes Zod validator caps at 2000 (Phase 151),
  but the TextInput on the complete screen had no maxLength. Provider
  typing 2500 chars hit Submit, got generic 400 with no field guidance.
  Now: maxLength={2000} + char counter.

**195 — checklist Report Issue button was UI theater (LAUNCH-BLOCKER discovery)**
  The provider checklist screen lets the provider tap "Report Issue"
  on any item, type a description, and tap "Send Report". The handler
  posts to POST /api/v1/bookings/:id/issues which DOES NOT EXIST on
  the backend (no route, no service, no migration, no table). The
  catch-block fabricated "Issue saved locally; will sync when you are
  back online" — there is NO local persistence either (no AsyncStorage
  write, no offline queue). Every issue report has been silently
  dropped while the UI shows green "Reported" success.
  Customer-visible impact:
  - Customers never receive the reports despite the modal text
    saying "the customer will be notified"
  - Disputes are weakened — providers reporting "unable to reach
    area" or "missing supplies" mid-job have no audit trail
  - Provider trust is broken — they trust the platform recorded it
  Documented in `.ai-coder/escalations/E05-checklist-issue-report-
  endpoint-missing-2026-05-06.md` with three fix options
  (recommendation: Option A — build the endpoint, ~3-4h).
  Until A lands, this commit applied Option C (band-aid honesty patch):
  catch-block now surfaces the real error via getErrorMessage()
  instead of fabricating "saved locally", and the alert title
  changed from green "Reported" to honest "Could not send report".
  Also rolled into Phase 195: provider quote line-item TextInputs
  (description + unit) were uncapped despite submitQuoteSchema
  capping description at 500 and unit at 30 — fixed.

### Final test counts after Phase 195

API: 239/239 suites, 2770/2770 tests
Mobile: 146/146 suites, 626/626 tests + 91 todo
Admin: 42/42 suites, 144/144 tests + 3 todo
Tsc clean across all 3 packages.

Total commits since Phase 127 closeout (f9e8d95): **101**
(67 bug fixes + 2 escalations + 32 closeout-doc updates).

Phase 195's discovery (E05) is the most significant find of this
audit run — a customer-and-provider-facing feature that has been
fake-passing since the checklist screen shipped. The escalation
documents the full backend build needed; the band-aid stops the
UI from lying immediately.

## What's still genuinely outstanding

Updated from PHASES-63-84-FINAL.md:

1. **LAUNCH BLOCKER (still):** E03 — customer fixed-price checkout
   409s on every purchase due to state-machine regression in 86a2417.
   Awaiting Ken's call between three documented fix options
   (recommendation: revert).
2. **NEW ESCALATION:** E04 — provider has no in-app way to respond
   to disputes; every dispute auto-resolves against provider after
   48h. Awaiting Ken's call between three documented fix options
   (recommendation: Option A — build the screen, ~4-6h).
2b. **NEW ESCALATION:** E05 — provider checklist "Report Issue"
   button posts to a non-existent endpoint; UI fabricates a fake
   "saved locally" success while customer never receives the report.
   Awaiting Ken's call between three options (recommendation:
   Option A — build the backend endpoint + table, ~3-4h). Phase 195
   landed an Option C band-aid (honest error messaging) so the UI no
   longer lies while the real fix is pending.
3. F#3 + F#4 baseline capture — F#4 done; F#3 blocked on simulator
4. F#10 attorney-reviewed disclaimer wording
5. 12 D14 operational items

Plus the v1.1+ candidates documented in earlier closeouts.
