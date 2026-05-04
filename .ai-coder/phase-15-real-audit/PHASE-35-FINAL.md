# Phase 35 — admin deeper + matching ranking + provider-admin + booking transitions (2026-05-04)

Phase 34 closed service-area + payouts + financial-admin + provider
self-service. Phase 35 hit four more surfaces from PHASE-34-FINAL's
continuation list. **Zero new bugs found** — every audited surface
already correctly implemented.

## Coverage delta

| Track | Phase 34 | Phase 35 |
|---|---|---|
| Admin dashboard + audit-log + blocked-IPs + manual escrow release | partial | **29/29 PASS** |
| Matching algorithm scoring + filtering + overnight schedule | partial (P30d) | **17/17 PASS** |
| Provider 360 admin (profile/jobs/financials/wallet/reviews/notes) | not tested | **27/27 PASS** |
| Booking status transition matrix (VALID_TRANSITIONS) | partial | **55/55 PASS** |
| Total real-runtime assertions | 1585+ | **1713+ (+128)** |

## Real bugs fixed in Phase 35

**Zero new bugs.** Every surface tested passed clean.

## Phase 35a — Admin deeper (29/29 PASS)

`test-phase35a-admin-deeper.mjs` covers admin endpoints not previously
hit:

1-8. Dashboard endpoints — kpis (legacy), kpis?range, revenue-trend,
booking-volume, acquisition-funnel, alerts, cities. Range validation
(`?range=lifetime` → 400).

9-10. Audit-log paginated + ?action filter.

11. Security-events listing.

12-16. Blocked-IPs lifecycle: POST creates, missing fields → 400, GET
lists includes our IP, DELETE removes, DELETE not-found → 404.

17. **Manual escrow release super_admin → 200, escrow_status flips to
    `released`, admin_actions row written with `manual_escrow_release`
    verb.** Pre-fix booking must have status='confirmed' AND
    escrow_status='held' (the service guard).

18. Short reason → 400 (10-char minimum enforced).

19. Already-released → 409.

20. **Admin (not super) → 403** — money-moving op restricted to super.

21. Customer → 403 on /dashboard.

22. No auth → 401.

23. /service-areas-waitlist admin paginated.

## Phase 35b — Matching ranking (17/17 PASS)

`test-phase35b-matching-ranking.mjs` proves the actual scoring formula:

```
score = (rating/5)*0.4 + (1 - dist/maxDist)*0.3 + acceptance*0.2 + tier_bonus*0.1
```

Setup: 7 providers (A-G) varied across rating, tier, distance, radius,
availability, schedule.

**Filtering (1-3):**
- Approved + is_available + in radius + on schedule providers matched
- Out-of-radius D excluded (D's own service_radius_km < customer distance)
- Unavailable E excluded (is_available=FALSE)
- Wrong-day F excluded (only Sunday schedule)

**Score ordering (4-7):**
- Top-A (5★ elite, 0.5km) outscores Mid-B (4★ verified, 3km) outscores Far-C (3★ new, 10km)
- Top of the list is A as expected

**Overnight schedule (8 — MED-N104):**
- Provider G with 22:00-06:00 schedule matches at 03:00 PHT
- Same-day providers A/B/C excluded at 03:00 (their 08-18 schedule doesn't cover it)

**Determinism (10):** Two consecutive calls return identical ordering and
identical scores.

**Score range (11-12):** A in [0.5, 0.95] — theoretical max ~0.93;
distance ~0.78km matching Haversine of 0.005°.

## Phase 35c — Provider-admin (27/27 PASS)

`test-phase35c-provider-admin.mjs` covers Provider 360 admin routes:

1-3. Profile read/update (admin → 403 on PATCH, super_admin → 200).
4-5. Jobs paginated + ?status filter.
6. Financials summary.
7-9. **Wallet adjust super_admin** (positive +20000 + negative -10000),
   admin (not super) → 403.
10. Reviews paginated.
11-13. Review visibility toggle + admin response (Zod boolean check
   rejects non-boolean → 400).
14. Disputes listing.
15. Activity (PII mask path).
16-19. Notes CRUD: GET, POST (writes `provider_note_added` admin_actions
   row with target_type='provider_note', target_id=note.id), PATCH, DELETE.
20. Customer → 403 on profile.

## Phase 35d — Booking status transitions (55/55 PASS)

`test-phase35d-booking-transitions.mjs` exhaustively asserts the
VALID_TRANSITIONS matrix in `booking.types.ts`:

**Happy-path (15):** every forward edge — requested → quoted/matched,
matched → payment_pending, payment_pending → paid, paid →
provider_en_route → provider_arrived → in_progress →
completed_by_provider → confirmed → payout_ready → paid_out, plus the
disputed → resolved → payout_ready branch.

**Customer-cancellable (6):** customer can cancel from requested,
quoted, matched, payment_pending, paid, provider_en_route.

**Customer CANNOT cancel after arrival (2):** provider_arrived and
in_progress block cancelled_by_customer — this is the design that
prevents service-and-no-show abuse.

**Admin can always cancel non-terminal (9):** including resolved.

**Provider-cancellable subset (3 + 3 blocks):** matched, paid, en_route
allowed; provider_arrived, in_progress, completed_by_provider blocked.

**Terminal states (4):** paid_out, cancelled_by_customer/provider/admin
have zero outgoing edges.

**Backwards transitions (5):** confirmed → in_progress, paid → matched,
paid_out → payout_ready, cancelled_by_admin → requested,
completed_by_provider → in_progress all blocked.

**Skip-the-line (5):** requested → paid (no payment skip), requested →
completed_by_provider, matched → in_progress (no arrival skip), paid →
completed_by_provider, confirmed → paid_out (must go through
payout_ready).

**Bogus statuses (2):** unknown source AND unknown target both rejected.

**Live API (1):** Customer PATCH /bookings/:id/status with
`status='cancelled_by_customer'` from a `provider_arrived` booking
returns 409 (matches the matrix).

## Cumulative across Phase 17 → 35

- **55 real bugs** found + fixed (unchanged Phase 35)
- **2 soft bugs** documented from earlier phases
- **7 migrations** (117/118/119/120/121/122/123)
- **1713+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 4413+ total assertions** verified
- **+1 latent route wired** (PII reveal)

## Test files committed in Phase 35

- `test-phase35a-admin-deeper.mjs` — 29 assertions
- `test-phase35b-matching-ranking.mjs` — 17 assertions
- `test-phase35c-provider-admin.mjs` — 27 assertions
- `test-phase35d-booking-transitions.mjs` — 55 assertions

## Files changed in Phase 35

None. Pure audit (test-only).

## Operational items surfaced for Ken/ops

- **Manual escrow release works as designed**: Super_admin only,
  10-char reason minimum, only releases when status IN
  ('confirmed','paid','resolved') AND escrow_status='held'. Already-
  released → 409. Admin → 403. Audit row `manual_escrow_release`
  written. Pre-fix release path was scoped wrong; the booking row's
  status check is the gate.
- **Matching algorithm proven correct end-to-end**: All four scoring
  components contribute as designed (rating 40%, distance 30%,
  acceptance 20%, tier 10%). Overnight schedule (start>end) handled.
  Filtering excludes unapproved/unavailable/out-of-radius/wrong-day
  providers. Result deterministic for same inputs.
- **Provider 360 wallet adjustments are auditable**: Both positive
  credits and negative debits work; admin (not super) → 403; balance
  changes verified at the DB level (₱100k → ₱120k → ₱110k).
- **Booking state machine is tight**: 55 transition assertions all
  green. Customer-can't-cancel-after-arrival rule (the anti-no-show-
  for-free invariant) verified both at the helper level (canTransition)
  AND via real API call (PATCH /:id/status returns 409).

## Continuation checklist

Stack still up. Reusable test files added:
- test-phase35a-admin-deeper.mjs
- test-phase35b-matching-ranking.mjs
- test-phase35c-provider-admin.mjs
- test-phase35d-booking-transitions.mjs

Phase 36 (next): real-product items per user request — quiet hours,
45s offer cycle, BIR PDF runtime. Plus a hard-stop escalation file
for the 12 D14 items + F#3 + F#10 that genuinely cannot be done
autonomously.
