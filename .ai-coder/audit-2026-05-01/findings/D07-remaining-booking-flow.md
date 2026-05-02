# Phase D Findings Part 7 — Remaining Booking-Flow Screens

Files added in this batch:
- `apps/mobile/app/customer/booking/payment-failed.tsx` (167)
- `apps/mobile/app/customer/booking/complete.tsx` (137)
- `apps/mobile/app/customer/booking/photos.tsx` (235)
- `apps/mobile/app/customer/booking/make-recurring.tsx` (251)
- `apps/mobile/app/customer/booking/job-request.tsx` (268)

**Phase D running total: ~9,969 lines fully read.**
**Audit grand total: ~29,643 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-88)

### CRIT-89 — payment-failed screen claims booking is held 15 min; server actually holds 72 hours
**File:** [apps/mobile/app/customer/booking/payment-failed.tsx:10, 86-89](apps/mobile/app/customer/booking/payment-failed.tsx#L10)
```ts
const HOLD_SECONDS = 15 * 60;
...
<Text style={styles.holdText}>
  Your booking is held for 15 minutes. Time left:{' '}
  <Text style={styles.holdCountdown}>{formatCountdown(secondsLeft)}</Text>
</Text>
```
Server's `expireUnmatchedBookings` worker (verified in B05/workers.ts:153-188) expires bookings only after `platformConfig.unmatchedBookingExpiryHours = 72`. Mobile claims 15 minutes.

When the 15-min mobile countdown hits 0, **nothing happens server-side.** The booking remains in 'requested' state for 72 hours. Customer:
1. Sees "Time left: 00:00 — booking expired" in UI.
2. Believes they need to start over from scratch.
3. Goes to home tab, picks the same service, fills in the same form, submits.
4. Server creates a SECOND booking row.
5. Original orphan + new booking both exist for 72h.

Either:
- Mobile lies to customer (real behavior is 72h, not 15min).
- OR ops want a real 15-min hold (need a new server-side worker + booking_holds table).

**Fix dispatch:**
```
1. Decision (Ken / product): is the 15-min hold real or aspirational?
   - If aspirational: change mobile to "Your booking is saved — complete payment when ready" (no countdown).
   - If real: add a server-side `payment_pending_expires_at` timestamp on bookings, plus a worker that expires `requested` or `payment_pending` bookings 15 min after creation if no payment intent was completed.
2. Either way, source from a single config value, not a hardcoded mobile constant.
3. Test: create booking, wait 16 minutes (or mock time), assert server state matches mobile claim.
```

### CRIT-90 — complete.tsx + terms.tsx + server settings disagree on auto-confirm hours
**Files:**
- [apps/mobile/app/customer/booking/complete.tsx:75](apps/mobile/app/customer/booking/complete.tsx#L75) — uses `platformConfig.escrowAutoConfirmHours` (= 24h, mobile config)
- [apps/mobile/app/customer/terms.tsx:30-33](apps/mobile/app/customer/terms.tsx#L30) — TOS Section 3 hardcoded "48-hour" (CRIT-83)
- Server `platformConfig.escrowAutoConfirmHours = 24` AND `platform_settings.escrow_auto_confirm_hours = 24`

**Confirms CRIT-83 internal inconsistency.** Customer who reads the in-flow message at `complete.tsx` sees "auto-confirmed in 24 hours." Same customer who reads TOS sees "48-hour auto-confirmation window." Two contradictory truths in the same app.

**Fix is the same as CRIT-83** — derive both numbers from one source (server-canonical), align messaging.

---

## MEDIUM bugs

### MED-164 — payment-failed "Use Different Payment Method" button routes to informational screen
**File:** [apps/mobile/app/customer/booking/payment-failed.tsx:70](apps/mobile/app/customer/booking/payment-failed.tsx#L70)
```ts
onPress={() => router.push(Routes.CUSTOMER.PAYMENT_METHODS)}
```
`Routes.CUSTOMER.PAYMENT_METHODS = '/customer/payment-methods'` is the **informational** screen (D04 read — read-only marketing copy explaining methods). Customer can't actually change their method from there.

The "Retry Payment" button (line 62) just calls `router.back()`, which takes them back to checkout. From checkout they CAN pick a different method. So the "Use Different Payment Method" button is a misnomer — it leads to a dead-end info page.

**Fix:** route directly to checkout with a flag to focus the payment-method selector.

### MED-165 — make-recurring frequency options are mobile-hardcoded; server may accept more
**File:** [apps/mobile/app/customer/booking/make-recurring.tsx:18-22](apps/mobile/app/customer/booking/make-recurring.tsx#L18)
```ts
const FREQUENCY_OPTIONS: { value: Frequency; label: string; desc: string }[] = [
  { value: 'weekly', label: 'Weekly', desc: 'Same day every week' },
  { value: 'bi_weekly', label: 'Bi-weekly', desc: 'Every two weeks' },
  { value: 'monthly', label: 'Monthly', desc: 'Once a month' },
];
```
Server `recurring_bookings.frequency` enum might include 'daily', 'quarterly', etc. Need to verify against schema (Phase G migrations). If server-side enum drifts, mobile becomes outdated. Better: fetch supported frequencies from /config or a /recurring/options endpoint.

### MED-166 — job-request URGENCY_OPTIONS hardcoded with English labels for window descriptions
**File:** [apps/mobile/app/customer/booking/job-request.tsx:13-18](apps/mobile/app/customer/booking/job-request.tsx#L13)
```ts
{ value: 'same_day' as const, label: 'Same Day', desc: 'Within 4 hours' },
{ value: 'within_3_days' as const, label: 'Within 3 Days', desc: 'Flexible scheduling' },
```
"Within 4 hours" matches server `booking.service.ts:951` `setHours(...+4)` for same_day urgency (verified in B03/MED-17). But hardcoded — drift risk. If ops tunes same_day to 6 hours server-side, mobile still says 4. Same fix dispatch as MED-17.

### MED-167 — make-recurring uses booking.scheduledAt's TIME for the recurring schedule
**File:** [apps/mobile/app/customer/booking/make-recurring.tsx:45-47](apps/mobile/app/customer/booking/make-recurring.tsx#L45)
```ts
const schedTime = booking.scheduledAt
  ? new Date(booking.scheduledAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila' })
  : '09:00';
```
- If the original booking was at 14:30, the recurring is locked to 14:30.
- No UI to change it before submission.
- Customer who wants weekly cleanings at 09:00 (different from the one-off they did at 14:30) has to manually edit the recurring after creation.

**Fix:** add a "Preferred time" picker (similar to the day picker). Default to original booking's time but allow change.

### MED-168 — payment-failed countdown ticks even when bookingId param is undefined
**File:** [apps/mobile/app/customer/booking/payment-failed.tsx:24-30](apps/mobile/app/customer/booking/payment-failed.tsx#L24)
The interval is set up only if bookingId exists, but `secondsLeft` defaults to `HOLD_SECONDS` (= 15 min). If bookingId is missing, the countdown shows but never decrements. Combined with the holdText being conditional on bookingId (line 85), this is a no-op — but the state setup is wasteful. Minor.

### MED-169 — make-recurring submits without preferred-time configurability
Same as MED-167 — flagging the UX gap as a separate concern.

### MED-170 — job-request budget input can produce NaN
**File:** [apps/mobile/app/customer/booking/job-request.tsx:47-48](apps/mobile/app/customer/booking/job-request.tsx#L47)
```ts
budgetMin: budgetMin ? Math.round(Number(budgetMin) * 100) : undefined,
budgetMax: budgetMax ? Math.round(Number(budgetMax) * 100) : undefined,
```
If user types "abc", `Number("abc") = NaN`, `Math.round(NaN * 100) = NaN`. Server's `createJobRequestSchema` (B07/booking.validators.ts:71-94) declares `budgetMin: z.number().int().min(0).optional()`. NaN passes typeof number === 'number' but fails Zod's int check. Server returns 400 — customer sees "Could not submit request." (per axErr/fetch mismatch CRIT-69).

**Fix:** validate input client-side: only allow digits + optional decimal, reject NaN before submission.

---

## LOW / INFO

- **complete.tsx is a clean confirm-or-dispute decision screen.** Single PATCH for confirm, navigation to dispute flow for "something's not right."
- **photos.tsx is excellent UX:** before/after/customer tabs with comparison banners ("Compare with N after photos"), full-screen modal viewer, count badges per tab.
- **make-recurring uses Bug 208 fix (no client-supplied servicePrice)** — server resolves canonical price.
- **job-request validates 50-char description + 2-photo minimum client-side.** Matches server validator.
- **job-request comment "Up to 5 providers will send you quotes"** matches server's `maxQuotesPerBooking: 5`. Aligned.
- **payment-failed has good information architecture** (icon + reason card + 3 actions: retry, change method, contact support).
- **photos.tsx Modal** correctly uses transparent + animationType='fade'. RN best practice.

---

## What's left in Phase D

- Other customer screens (provider/[id], addresses, address-picker, chat, search, suki-pros, recurring/[id], category, referral, safety-and-support, help, notifications, notification-settings, _layout) (~3,000 lines)
- Mobile shared services remaining (recurring, booking-photo, catalog, review, tip, pricing, rebooking, slot-waitlist) (~700 lines)
- Mobile components (PhoneInput, Avatar, FilterChips, FilterModal, ConfirmModal, OTPInput, StatusBadge, PulsingDot, OptimizedList, Toast, etc.) (~2,500 lines)
- Mobile utils (currency, date, phone, image-picker hook) (~500 lines)

That's about 6,700 more lines. Realistically, Phase D will need one more session to fully complete. Closing this session with handoff for the remaining work.
