// BUG-PHASE90-01 — payment-failed.tsx countdown anchored on createdAt.
//
// Pre-fix: secondsLeft was initialized to HOLD_SECONDS (72h) every
// time the screen mounted. A booking created 5h ago that hit
// payment-failed (e.g., on a retry attempt) showed "72:00" remaining
// even though the server-side `expireUnmatchedBookings` worker
// would actually cancel it at created_at + 72h, leaving only ~67h.
// The customer was misinformed about how much time they had to
// retry.
//
// Fix: useQuery the booking by id, and once createdAt loads, seed
// secondsLeft to (createdAt + 72h - now()). The HOLD_SECONDS
// default remains as the pre-load fallback so the timer doesn't
// flicker to 0 before the fetch returns.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PAYMENT_FAILED = readFileSync(
  resolve(__dirname, '../app/customer/booking/payment-failed.tsx'),
  'utf8',
);

describe('BUG-PHASE90-01 — payment-failed countdown re-anchors on booking createdAt', () => {
  it('BUG-PHASE90-01 — useQuery + getBookingById are imported', () => {
    expect(PAYMENT_FAILED).toMatch(/from '@tanstack\/react-query'/);
    expect(PAYMENT_FAILED).toMatch(/getBookingById/);
  });

  it('BUG-PHASE90-01 — query is keyed on bookingId and gated on its presence', () => {
    expect(PAYMENT_FAILED).toMatch(/queryKey:\s*\['booking',\s*bookingId\]/);
    expect(PAYMENT_FAILED).toMatch(/enabled:\s*!!bookingId/);
  });

  it('BUG-PHASE90-01 — useEffect re-seeds secondsLeft from createdAt + HOLD_HOURS', () => {
    expect(PAYMENT_FAILED).toMatch(/HOLD_HOURS = 72/);
    // The seed must read createdAt and compute remaining seconds via
    // `expiryMs - Date.now()`. Both pieces must be present.
    expect(PAYMENT_FAILED).toMatch(/bookingQuery\.data\?\.createdAt/);
    expect(PAYMENT_FAILED).toMatch(/HOLD_HOURS \* 60 \* 60 \* 1000/);
    expect(PAYMENT_FAILED).toMatch(/Math\.max\(0,\s*Math\.floor\(\(expiryMs - Date\.now\(\)\) \/ 1000\)\)/);
  });

  it('BUG-PHASE90-01 — fallback HOLD_SECONDS is preserved for the pre-load state', () => {
    // Before bookingQuery returns, the timer must still tick from a
    // sensible value rather than 0. Match HOLD_HOURS so they cannot
    // drift apart.
    expect(PAYMENT_FAILED).toMatch(/const HOLD_SECONDS = HOLD_HOURS \* 60 \* 60/);
    expect(PAYMENT_FAILED).toMatch(/useState\(HOLD_SECONDS\)/);
  });
});
