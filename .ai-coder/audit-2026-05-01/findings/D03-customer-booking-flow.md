# Phase D Findings Part 3 — Customer Booking Flow Screens

Files added in this batch (10 booking-flow screens):
- `apps/mobile/app/customer/booking/checkout.tsx` (357)
- `apps/mobile/app/customer/booking/confirm.tsx` (253)
- `apps/mobile/app/customer/booking/configure.tsx` (279)
- `apps/mobile/app/customer/booking/form.tsx` (318)
- `apps/mobile/app/customer/booking/[id].tsx` (437)
- `apps/mobile/app/customer/booking/change-order.tsx` (353)
- `apps/mobile/app/customer/booking/dispute.tsx` (239)
- `apps/mobile/app/customer/booking/review.tsx` (324)
- `apps/mobile/app/customer/booking/tracker.tsx` (261)
- `apps/mobile/app/customer/booking/tip.tsx` (229)
- `apps/mobile/app/customer/booking/quotes.tsx` (266)

**Phase D running total: ~6,256 lines fully read.**
**Audit grand total: ~25,930 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-73)

### CRIT-74 — Booking is created BEFORE payment attempt; abandoned checkout strands the booking
**File:** [apps/mobile/app/customer/booking/checkout.tsx:72-102](apps/mobile/app/customer/booking/checkout.tsx#L72)
```ts
const booking = await createBooking({...});           // ← booking row created on server
const intent = await createPaymentIntent(booking.id, selectedMethod);
reset();
router.replace({ pathname: '/customer/booking/confirm', params: { bookingId: booking.id } });

if (selectedMethod !== 'wallet' && intent.checkoutUrl) {
  const canOpen = await Linking.canOpenURL(intent.checkoutUrl);
  if (canOpen) {
    await Linking.openURL(intent.checkoutUrl);   // ← user redirected to PayMongo
  }
}
```
Sequence:
1. Booking row created (status='requested', escrow_status='pending').
2. Payment intent created.
3. Local draft `reset()`'d.
4. User redirected to confirm screen.
5. Linking opens PayMongo checkout in browser.

**If the customer closes the PayMongo browser without paying:**
- Booking sits at status='requested' with no payment.
- The `confirm.tsx` screen shows "Booking Submitted! Complete your payment to confirm this booking."
- **There is no "Retry Payment" button on the confirm screen.**
- The booking detail screen `[id].tsx` (line 110) marks `requested` as cancellable. Customer can cancel, but they can't easily pay.

The customer is stuck. Their booking exists, they've abandoned payment, the only escape is to cancel and start over (losing all the form data — `reset()` already wiped the draft at line 91).

**Fix dispatch:**
```
1. confirm.tsx: detect status (requested/payment_pending) and show "Pay Now" button that:
   - Calls createPaymentIntent again with bookingId.
   - Opens the new checkoutUrl.
2. booking/[id].tsx: add a prominent "Pay Now" CTA when status === 'payment_pending' OR (status === 'requested' AND no payment intent has succeeded).
3. Cleaner alternative: don't create booking until PayMongo confirms payment via webhook.
   - Customer → POST /bookings/intent { ...booking details, paymentMethod }.
   - Server creates payment_intent, returns clientKey + checkoutUrl. NO booking row yet.
   - Customer pays via PayMongo.
   - Webhook receives payment.paid → creates booking + holds escrow + updates status='paid'.
   - Mobile polls bookingId-by-payment-intent until visible.
   This is more invasive but eliminates the orphan-booking problem entirely.
4. Add ops monitoring: bookings stuck in 'requested' for >1 hour → alert / email customer / auto-cancel.
5. Test: open checkout, kill app before completing PayMongo, verify booking detail shows clear path to retry.
```

### CRIT-75 — Mobile booking flow recomputes service fee using in-memory constants (CRIT-13/42 manifestation)
**File:** [apps/mobile/app/customer/booking/configure.tsx:62-65](apps/mobile/app/customer/booking/configure.tsx#L62)
```ts
const localFee = Math.max(
  platformConfig.minimumServiceFee,
  Math.min(platformConfig.maximumServiceFee, Math.round(subtotal * platformConfig.serviceFeeRate)),
);
```
**Same root cause as CRIT-13 (server platform.config drift) — now manifesting in mobile.** The mobile uses the same `platformConfig` constants for fee calculation. If admin tunes `service_fee_rate` (or min/max) in the DB:

1. Server's new `services/booking/pricing.service.ts:resolvePricing` uses DB settings → server returns NEW total.
2. Mobile UI shows OLD total computed from in-memory constants.
3. Customer sees ₱510 in checkout, server bills ₱525 → confusion or refund request.

Worse: mobile booking.store also uses these to compute `serviceFee` and `total` (need to verify in store read). Customer is shown the wrong number throughout the flow.

**Fix dispatch:**
```
1. Mobile should NEVER compute prices locally. Instead:
   - Fetch /api/v1/bookings/pricing-preview { basePrice, addons, scheduledAt, categoryId, city } whenever inputs change.
   - Display the server's computed total + breakdown.
2. Replace `useBookingStore`'s computed serviceFee/total with values from a useQuery on /pricing-preview.
3. Cache aggressively (60s) so debounced pricing previews don't hammer the server.
4. Keep platformConfig values as fallback for offline display only — clearly marked "Estimated".
5. Test: change server's service_fee_rate setting, open booking flow, assert mobile UI matches server-canonical total.
```

### CRIT-76 — Mobile tip cap is hardcoded to servicePrice; ignores server's tip_max_amount_cents
**File:** [apps/mobile/app/customer/booking/tip.tsx:43, 70-72](apps/mobile/app/customer/booking/tip.tsx#L43)
```ts
const maxTip = servicePrice;
...
if (tipAmount > maxTip) {
  Alert.alert('Tip Too Large', `Maximum tip is ${formatPHP(maxTip)} (100% of service price).`);
  return;
}
```
Server enforces `tip_max_amount_cents` from platform_settings (verified in B01 — Bug 417 fix, default ₱5,000). If the customer's booking is, say, ₱8,000, mobile lets them try to tip ₱8,000 — server rejects with "Tip exceeds maximum of ₱5,000". Confusing UX.

The endpoint `/api/v1/tips/limits` exists (verified in B05) and returns the canonical min/max. Mobile should use it.

**Fix dispatch:**
```
1. In tip.tsx, fetch limits via useQuery:
   const { data: limits } = useQuery({
     queryKey: ['tipLimits'],
     queryFn: () => api.get<{success:true, data: {minCents:number, maxCents:number}}>('/api/v1/tips/limits').then(r => r.data.data),
     staleTime: 5*60*1000,
   });
   const maxTip = Math.min(servicePrice, limits?.maxCents ?? servicePrice);
2. Show server cap in error message.
3. Disable tip presets that exceed cap (e.g., 20% on a ₱5,000 booking = ₱1,000, OK; on a ₱30,000 booking = ₱6,000 > ₱5,000 cap → disabled).
4. Test: server tip_max_amount_cents=500_000, mobile preset 20% on ₱30,000 booking, expect 20% chip disabled or marked "max ₱5,000".
```

### CRIT-77 — Tracker fallback map centers on Manila — Boracay launch users see wrong region
**File:** [apps/mobile/app/customer/booking/tracker.tsx:113-118](apps/mobile/app/customer/booking/tracker.tsx#L113)
```ts
initialRegion={bookingRegion ?? {
  latitude: 14.5995,    // ← Manila (NOT Boracay)
  longitude: 120.9842,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
}}
```
Per CLAUDE.md: "onService PH is a remote home-services marketplace launching in Boracay, Philippines." Boracay is at ~11.97°N, 121.92°E. Mobile fallback shows Manila. Customer who books without coordinates (street address only) opens tracker → sees Manila — confusing flash before the real region loads (if at all).

**Fix dispatch:**
```
1. Move fallback coordinates to platformConfig:
   defaultMapCenter: { latitude: 11.9698, longitude: 121.9243 } // Boracay
2. Read from platformConfig in tracker.tsx fallback.
3. Add a service-area-aware fallback: read user's selected service area from useAddressStore (when implemented per MED-123) and center on that region.
4. Test: open tracker with no booking lat/lng, expect Boracay-centered map.
```

---

## MEDIUM bugs

### MED-132 — Multiple booking-flow screens use the same axErr/fetch error-shape mismatch
**Files:**
- `customer/booking/checkout.tsx:103-106`
- `customer/booking/[id].tsx:80-83`
- `customer/booking/review.tsx:118-121`
- `customer/booking/tip.tsx:56-60`

Same pattern as CRIT-69 (D01). All show generic fallback messages. Apply the same `extractErrorMessage` fix from CRIT-69.

### MED-133 — Configure screen stores addon prices client-side; server may reject if drift
**File:** [apps/mobile/app/customer/booking/configure.tsx:53](apps/mobile/app/customer/booking/configure.tsx#L53)
```ts
next.set(addon.id, { id: addon.id, name: addon.name, price: addon.price });
```
Stores the price seen at fetch time. Used in form.tsx:178-189 to show breakdown. Server resolves canonical price by ID (Bug 176 fix), so customer is charged correctly even if mobile cache is stale — but mobile UI may show different numbers than the server bills. Better: never display addon prices that didn't come from a fresh server-side computation.

### MED-134 — Tracker socket subscription on status doesn't trigger React Query refetch
**File:** [apps/mobile/app/customer/booking/tracker.tsx:60-62](apps/mobile/app/customer/booking/tracker.tsx#L60)
```ts
socket.on(`booking:${bookingId}:status`, () => {
  // Status update will be caught by refetchInterval
});
```
15-second polling fallback works, but the socket event arrived first — the listener should `queryClient.invalidateQueries(['booking', bookingId])` to refresh immediately.

### MED-135 — Quote acceptance routes to booking detail with no clear "pay now" path
**File:** [apps/mobile/app/customer/booking/quotes.tsx:130-132](apps/mobile/app/customer/booking/quotes.tsx#L130)
```ts
Alert.alert('Success', 'Quote accepted! Proceed to payment.', [
  { text: 'OK', onPress: () => router.replace(`/customer/booking/${bookingId}`) },
]);
```
After accepting a quote, server moves booking to `payment_pending`. Mobile routes to `[id].tsx`. But `[id].tsx` doesn't show a "Pay Now" CTA for `payment_pending` status (only Track Booking, Cancel, etc.). User has to find their way to checkout manually.

**Fix:** route to checkout directly with the new total, OR add a `payment_pending` action to `[id].tsx`.

### MED-136 — Change-order pay button shows wrong total when paying an already-approved order
**File:** [apps/mobile/app/customer/booking/change-order.tsx:226-232](apps/mobile/app/customer/booking/change-order.tsx#L226)
```tsx
onPress={() => setPendingPayment({
  id: order.id,
  status: 'approved',
  bookingId: order.bookingId,
  paymentRequired: true,
  additionalAmount: order.additionalAmount,
  // additionalServiceFee, additionalTotal NOT set
})}
```
Re-shown payment screen omits `additionalServiceFee` and `additionalTotal`. UI falls back to "Pay from Wallet" generic label. Customer sees no total — surprises them at confirm. Should re-fetch the change order detail to get the canonical fee/total breakdown.

### MED-137 — Booking form TIME_SLOTS hardcoded
**File:** [apps/mobile/app/customer/booking/form.tsx:19-22](apps/mobile/app/customer/booking/form.tsx#L19)
```ts
const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
```
Hardcoded service hours. No noon (lunch break? intentional?). No evenings. Should be platform-tunable per category — some services run extended hours.

### MED-138 — Booking dispute "auto-resolves in your favor after 48h" claim must be verified server-side
**File:** [apps/mobile/app/customer/booking/dispute.tsx:172](apps/mobile/app/customer/booking/dispute.tsx#L172)
> "Unresponded disputes resolve in your favor"

Mobile makes a hard promise. Server (`dispute.service.ts:autoEscalateStaleDisputes` per B05/workers.ts:454-456) escalates stale disputes — but escalation ≠ resolve in customer's favor. Need to verify server actually auto-resolves with a refund after the window. If not, mobile lies to the customer.

**Fix:** verify server behavior. Either (a) make the promise real (auto-refund after 48h no provider response), or (b) soften the mobile copy to "we'll review your dispute on your behalf if the provider doesn't respond in 48h."

### MED-139 — Cancel booking from [id].tsx shows generic success message even if escrow handling failed
**File:** [apps/mobile/app/customer/booking/[id].tsx:78](apps/mobile/app/customer/booking/[id].tsx#L78)
```ts
Alert.alert('Booking Cancelled', 'Your booking has been cancelled. Any applicable refund will be processed automatically.');
```
If server-side cancellation hit CRIT-34 (B06 — non-atomic escrow handling), booking IS cancelled but no refund processed. Mobile shows the optimistic message. Customer waits forever for refund.

Once server CRIT-34 is fixed (atomic transaction), this becomes accurate. Until then, mobile should check the response — if there's a `warning` field with code='ESCROW_PROCESSING_DELAYED' (per booking.routes.ts:566 read in B06), surface that warning to the customer.

### MED-140 — Review submission auto-routes to tip flow even if the user skipped it
**File:** [apps/mobile/app/customer/booking/review.tsx:117](apps/mobile/app/customer/booking/review.tsx#L117)
```ts
router.replace({ pathname: '/customer/booking/tip', params: { bookingId } });
```
After successful review submission, jumps straight to tip screen. Combined with line 235-240 (Skip button also routes to tip), customer can never NOT see the tip screen. **OK design choice** — but tip.tsx must handle "user pressed Maybe Later" gracefully (it does — line 170-174 routes to make-recurring).

### MED-141 — Review screen comment 1000-char limit per hint, but no enforcement
**File:** [apps/mobile/app/customer/booking/review.tsx:181](apps/mobile/app/customer/booking/review.tsx#L181)
Hint says "1000 characters" but the Input doesn't pass `maxLength={1000}`. Server-side review validation should reject — verify validators/review.validators.ts.

---

## LOW / INFO

- **booking/[id].tsx** is well-structured: status-aware action buttons, ConfirmModal for destructive cancel (Bug 998), real-time refresh, comprehensive receipt with Suki discount line.
- **change-order.tsx wallet-only enforcement** correctly aligns with server (Bug 1219 fix in B06: `change order additional payments must be paid via wallet balance`).
- **dispute.tsx is excellent UX**: 7 dispute types with icons, evidence-required gates for damage/theft, 50-char min description, explicit "what happens next" steps.
- **tip.tsx wallet-only paymentMethod** correctly aligns with server-side state (CRIT-05 in B01 — non-wallet tips broken).
- **tip.tsx "100% goes to provider"** trust claim is true per server's tip.service.ts (no commission deducted).
- **quotes.tsx structured-quote display** with line items, labor/materials breakdown, expiry tracking. Good.
- **review.tsx supports sub-ratings, quick tags, private note to support.** Comprehensive.
- **tracker.tsx polls + socket** for real-time updates — correct dual-strategy pattern.
- **D04 SiguradoShield pull comments** consistently applied across screens (Bug 834 in checkout/confirm, etc).

---

## What's left in Phase D

- Customer wallet/payment/account screens (~1,500 lines): wallet-topup, payment-methods, account-management, data-rights, terms
- Customer remaining booking flow (smaller): payment-failed, complete, photos, make-recurring, job-request
- Other customer screens (~3,000 lines): provider/[id], addresses, address-picker, chat, search, suki-pros, recurring, safety, help, notifications, etc.
- Mobile shared services + components (~6,500 lines): payment.service, push.service, recurring.service, navigation config, stores, components

These will be in Phase D continuation (next session).
