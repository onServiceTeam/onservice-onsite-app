// Phase 200 — auto-dispatch precondition (booking-offer.service.shouldAutoDispatch).
//
// A new booking is auto-offered to the best provider on creation only when it
// is a fixed-price booking that already has service coordinates. Quote-based
// job-requests and coordinate-less bookings are excluded (kickOfferCycle
// needs lat/lng). The admin auto_dispatch_enabled toggle is checked
// separately by the route; this is the shape gate.

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...a: unknown[]) => dbQueryMock(...a) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { shouldAutoDispatch } from '../src/services/booking-offer.service';

describe('Phase 200 — shouldAutoDispatch precondition', () => {
  it('TRUE for a fixed-price booking with coordinates', () => {
    expect(shouldAutoDispatch({ booking_type: 'fixed_price', latitude: '10.3157', longitude: '123.8854' })).toBe(true);
  });

  it('FALSE for a quote-based booking (uses the quote flow instead)', () => {
    expect(shouldAutoDispatch({ booking_type: 'job_request', latitude: '10.3157', longitude: '123.8854' })).toBe(false);
  });

  it('FALSE when latitude is missing', () => {
    expect(shouldAutoDispatch({ booking_type: 'fixed_price', latitude: null, longitude: '123.8854' })).toBe(false);
  });

  it('FALSE when longitude is missing', () => {
    expect(shouldAutoDispatch({ booking_type: 'fixed_price', latitude: '10.3157', longitude: null })).toBe(false);
  });
});
