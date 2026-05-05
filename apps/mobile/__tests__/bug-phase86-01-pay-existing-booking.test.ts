// BUG-PHASE86-01 — payment_pending bookings need a payment entry
// point. Pre-fix path:
//   1. Customer creates a quote-based booking (status='requested').
//   2. Provider submits a quote.
//   3. Customer accepts it via /customer/booking/quotes — server
//      flips booking.status to 'payment_pending' and quotes.tsx
//      routes the customer to /customer/booking/[id].
//   4. The booking detail screen had ACTIVE_STATUSES, COMPLETED_
//      STATUSES, CANCELLABLE_STATUSES, NEEDS_CONFIRMATION — but no
//      branch for payment_pending. The customer saw "Cancel Booking"
//      and "Chat with Provider" — no path to actually pay.
//
// Fix:
//   - New screen apps/mobile/app/customer/booking/pay.tsx that takes
//     a bookingId, fetches the booking, shows a payment-method
//     picker, and calls createPaymentIntent(bookingId, method).
//   - Booking detail renders "Complete Payment" → /pay?bookingId=…
//     when status='payment_pending'.
//   - Quotes accept routes directly to /pay instead of the dead-end
//     booking detail.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PAY = readFileSync(
  resolve(__dirname, '../app/customer/booking/pay.tsx'),
  'utf8',
);
const BOOKING_DETAIL = readFileSync(
  resolve(__dirname, '../app/customer/booking/[id].tsx'),
  'utf8',
);
const QUOTES = readFileSync(
  resolve(__dirname, '../app/customer/booking/quotes.tsx'),
  'utf8',
);

describe('BUG-PHASE86-01 — pay-existing-booking screen exists with the right wiring', () => {
  it('BUG-PHASE86-01 — pay.tsx fetches the booking and calls createPaymentIntent(bookingId, method)', () => {
    expect(PAY).toMatch(/getBookingById\(bookingId/);
    expect(PAY).toMatch(/createPaymentIntent\(bookingId, selectedMethod\)/);
  });

  it('BUG-PHASE86-01 — pay.tsx refuses to operate on a booking that is not payment_pending', () => {
    // Server-canonical state check — guards against linking to a
    // booking that's already paid or never reached payment_pending.
    expect(PAY).toMatch(/booking\.status !== 'payment_pending'/);
  });

  it('BUG-PHASE86-01 — pay.tsx exposes the same 5 PayMongo channels as the new-booking checkout', () => {
    // Channel list parity matters because the API rejects unknown
    // method strings in createPaymentIntent.
    expect(PAY).toMatch(/id: 'gcash'/);
    expect(PAY).toMatch(/id: 'maya'/);
    expect(PAY).toMatch(/id: 'card'/);
    expect(PAY).toMatch(/id: 'wallet'/);
    expect(PAY).toMatch(/id: 'qrph'/);
  });

  it('BUG-PHASE86-01 — pay.tsx opens the PayMongo checkoutUrl for non-wallet methods only', () => {
    // Wallet payments are atomic on the server (escrow funded in the
    // same transaction); only PayMongo channels need the redirect.
    expect(PAY).toMatch(/selectedMethod !== 'wallet' && intent\.checkoutUrl/);
    expect(PAY).toMatch(/Linking\.openURL\(intent\.checkoutUrl\)/);
  });
});

describe('BUG-PHASE86-01 — booking detail renders Complete Payment for payment_pending', () => {
  it('BUG-PHASE86-01 — needsPayment flag derived from status === payment_pending', () => {
    expect(BOOKING_DETAIL).toMatch(/booking\.status === 'payment_pending'/);
    expect(BOOKING_DETAIL).toMatch(/const needsPayment/);
  });

  it('BUG-PHASE86-01 — Complete Payment button routes to /customer/booking/pay', () => {
    expect(BOOKING_DETAIL).toMatch(
      /needsPayment[\s\S]*?Complete Payment[\s\S]*?\/customer\/booking\/pay\?bookingId=/,
    );
  });
});

describe('BUG-PHASE86-01 — quotes accept routes to the pay screen, not the dead-end booking detail', () => {
  it('BUG-PHASE86-01 — accept-success replaces to /customer/booking/pay', () => {
    expect(QUOTES).toMatch(
      /onSuccess[\s\S]*?router\.replace\(`\/customer\/booking\/pay\?bookingId=\$\{bookingId\}`/,
    );
  });

  it('BUG-PHASE86-01 — pre-fix dead-end route (replace to /customer/booking/${bookingId} on accept) is gone', () => {
    // The accept-success block must no longer route to the booking
    // detail. The detail screen still exists for other navigation;
    // we only check the accept-success branch specifically.
    const acceptBlock = QUOTES.match(
      /const acceptMutation = useMutation\(\{[\s\S]*?\}\);/,
    );
    expect(acceptBlock).not.toBeNull();
    const block = acceptBlock ? acceptBlock[0] : '';
    expect(block).not.toMatch(
      /router\.replace\(`\/customer\/booking\/\$\{bookingId\}`\)/,
    );
  });
});
