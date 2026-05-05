// BUG-PHASE131-01 — booking-offer.service.ts:kickOfferCycle hardcoded
// 'Boracay' as the city in the push notification to the next provider:
//
//   await notificationService.notifyProviderNewJob(
//     next.userId, bookingId, 'New job available',
//     bk.service_price,
//     'Boracay',  // city — we'd pull from booking.city but offer service stays slim
//   );
//
// The author left the comment as a TODO ("we'd pull from booking.city").
// For v1.0 (Boracay-only launch) this happened to be correct most of
// the time — but admin-created test bookings or any v1.1 city expansion
// would have shown providers the wrong city in the push notification
// ("New job in Boracay" when the job is actually in Caticlan, Manila,
// Cebu, etc.). The fix sources `city` from the booking row, which is
// already the same field that drives the matching service area.
//
// Same lazy-shortcut-needs-cleanup pattern as Phase 122 (tip.service
// dead branches) and Phase 110 (navigate.tsx dead ETA styles): a
// developer left a TODO comment instead of doing the small amount
// of work to do it right. Both this and the offer-service comment
// are now resolved.
//
// Test strategy: source-content regression. The behavioral path
// (provider gets push with correct city) requires the full booking
// + provider + push-stack mock chain — not in scope here. The fix
// is a one-line constant change; source-level assertion is the
// most direct way to catch a regression.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/booking-offer.service.ts'),
  'utf8',
);

describe('BUG-PHASE131-01 — booking-offer hardcoded "Boracay" replaced with bk.city', () => {
  it('the SELECT query in loadBookingForOffer fetches the city column', () => {
    expect(SOURCE).toMatch(/SELECT[^;]+city\b[\s\S]+FROM bookings WHERE id = \$1/);
  });

  it('BookingOfferContext interface declares city as a string', () => {
    expect(SOURCE).toMatch(/city:\s*string\s*;/);
  });

  it('notifyProviderNewJob now receives bk.city, not a hardcoded string', () => {
    // Match the function call as a multi-line block.
    expect(SOURCE).toMatch(
      /notifyProviderNewJob\([\s\S]+?bk\.service_price,[\s\S]+?bk\.city,/,
    );
  });

  it('notifyProviderNewJob call ends with bk.city, not a hardcoded string', () => {
    // The 5th positional arg (city) used to be `'Boracay'`. Assert
    // the call closes with `bk.city,\n  );` — i.e., the last
    // positional argument is the row reference, not a string literal.
    expect(SOURCE).toMatch(/bk\.city,\s*\)\s*;/);
  });

  it('regression guard: the PHASE131 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE131-01/);
  });
});
