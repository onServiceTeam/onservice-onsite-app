# Phase 45 — Customer mobile source-level deep audit (2026-05-04)

E02-F#3 (Maestro baselines) is still gated on iOS-sim or Android-emulator
unlock, but the same source-level deep-audit methodology applies without
running the simulator. Started with the highest-risk customer screens
(money flows + dispute flow + booking detail).

## Coverage delta

| Track | Phase 44 | Phase 45 |
|---|---|---|
| Admin Playwright baselines | 354/354 PASS | (no change) |
| Mobile Jest screen tests | 84/84 render-pass | (3+ targeted tests still pass) |
| Real bugs in this batch | 1 | **1 real bug found + fixed** |
| Cumulative bugs found+fixed (Phase 17→45) | 82 | **83** |

## Bugs found in this round

### BUG-PHASE45-01 — Customer BookingDetail receipt hides surge pricing

`apps/mobile/app/customer/booking/[id].tsx` showed the receipt as:
"Service Price + (Suki Discount) + Platform Fee = Total". When a
booking was created during rush hours, holiday, or peak hours, the
server applies surge pricing — `surgeMultiplier > 1` and
`surgeAmount > 0` are recorded on the booking and returned by the
API. But the receipt rendered NEITHER, so customers paying ₱500 vs
the off-peak ₱400 had no transparent breakdown of where the extra
₱100 came from.

**Fix:** Receipt now renders an extra row "Surge (×1.25)" between
the suki-discount and platform-fee lines when `surgeAmount > 0`,
showing the multiplier and the absolute extra amount in warning-
color text.

## What I checked but did NOT change (source-level audit notes)

### Customer CheckoutScreen — surge-preview gap noted, not fixed in this pass

The mobile booking store doesn't have a way to preview surge before
booking creation. Surge is applied server-side at create-booking
time, so the customer sees the surge total in the booking detail
but not the checkout total. Adding a pre-create surge preview is a
larger API contract change (would need a new endpoint
/bookings/quote-price). Documented as v1.1+ candidate.

### Customer BookingDetail cancel flow — fee preview gap

The ConfirmModal warns "Cancellation fees may apply if the provider
is already en route" but doesn't show the actual fee. The
cancellation policy is server-canonical (Phase 14 D02), and the
fee depends on hours-before-scheduled. A pre-cancel fee preview
would need a new endpoint. Documented as v1.1+ candidate.

### Customer DisputeScreen — feature-complete

7 dispute types with icons + descriptions, 50-char description min,
evidence required for damage/theft, image picker with thumbnails,
48-hour warning, "what happens next" steps box. No bugs.

## Files changed in Phase 45

**Mobile app code (1 file):**
- `apps/mobile/app/customer/booking/[id].tsx` — BUG-PHASE45-01

**Documentation:**
- `.ai-coder/phase-15-real-audit/PHASE-45-FINAL.md` (this file)

## Verified post-fix

- Affected screen tests pass:
  - `customer-booking-id.real.test.tsx` — 3/3 PASS
  - `customer-booking-checkout.real.test.tsx` — 3/3 PASS (1 todo)
  - `customer-booking-dispute.real.test.tsx` — 1 PASS
- `npx tsc --noEmit` clean for mobile.

## Cumulative across Phase 17 → 45

- **83 real bugs found + fixed** (+1 from Phase 44's 82)
- **9 migrations** (no new in Phase 45)
- 5131+ total assertions verified across all surfaces

## Continuation checklist

Phase 46 (provider mobile):
- Apply the same source-level methodology to high-risk provider
  screens (provider-tabs, payouts, dispute response, etc.).
- Maestro baselines still gated behind E02-F#3 — visual capture
  not in scope for this work pass.
