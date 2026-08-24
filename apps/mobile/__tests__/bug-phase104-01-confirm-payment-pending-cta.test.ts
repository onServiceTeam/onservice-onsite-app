// BUG-PHASE104-01 — booking/confirm.tsx had a UX gap when a booking
// landed there in `payment_pending` (typically: the PayMongo checkout
// failed / was cancelled, or the user backed out of GCash/Maya):
// - subtitle said "Complete your payment to confirm this booking."
// - but no "Complete Payment" CTA was rendered.
// - the only forward path was tap "View Booking" → then find
//   "Complete Payment" on /customer/booking/[id]. Two taps where one
//   should do, on the screen that explicitly told the user to pay.
//
// Fix: when booking is loaded and status is NOT paid (payment_pending
// or escrow not yet held), render a direct "Complete Payment" CTA at
// the top of the actions stack that routes to
// /customer/booking/pay?bookingId={id} (the dedicated pay-existing-
// booking screen added in Phase 86). The "View Booking" button drops
// to outline variant so the primary action is visually obvious.
//
// When booking IS paid, the layout stays exactly as before (View
// Booking primary, Back to Home outline) — no regression for the
// happy path.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CONFIRM = readFileSync(
  resolve(__dirname, '../app/customer/booking/confirm.tsx'),
  'utf8',
);

describe('BUG-PHASE104-01 — confirm screen surfaces direct Complete Payment CTA when booking is unpaid', () => {
  it('BUG-PHASE104-01 — Complete Payment button rendered conditionally on !isPaid', () => {
    expect(CONFIRM).toMatch(/!isPaid/);
    expect(CONFIRM).toMatch(/title="Complete Payment"/);
  });

  it('BUG-PHASE104-01 — Complete Payment button routes to /customer/booking/pay?bookingId=...', () => {
    expect(CONFIRM).toMatch(/router\.replace\(`\/customer\/booking\/pay\?bookingId=\$\{bookingId\}`\)/);
  });

  it('BUG-PHASE104-01 — View Booking falls to outline variant when booking is unpaid (so Complete Payment reads as primary)', () => {
    expect(CONFIRM).toMatch(/variant=\{booking && !isPaid \? 'outline' : undefined\}/);
  });

  it('BUG-PHASE104-01 — isPaid still derived from status===paid OR escrowStatus===held (regression guard)', () => {
    expect(CONFIRM).toMatch(/booking\?\.status === 'paid'/);
    expect(CONFIRM).toMatch(/booking\?\.escrowStatus === 'held'/);
  });

  it('BUG-PHASE104-01 — paid-state subtitle still routes through the same isPaid flag', () => {
    expect(CONFIRM).toMatch(/Your booking shows paid/);
    expect(CONFIRM).toMatch(/Complete your payment to confirm this booking\./);
  });
});
