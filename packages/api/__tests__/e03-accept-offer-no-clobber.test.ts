// E03 — instant-pay safety. Under instant-pay a customer can pay before a
// provider is matched, so by the time a provider accepts an offer the booking may
// already be 'paid'. acceptOffer must assign the provider WITHOUT resetting a
// paid booking back to 'matched' (that would corrupt the money state and
// re-demand payment). Behavioral test: drive acceptOffer with a mocked
// transaction client and assert the bookings UPDATE is the payment-safe
// conditional form, not an unconditional status='matched'.

const txClientQuery = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (fn: (client: { query: (...a: unknown[]) => unknown }) => unknown) =>
      fn({ query: (...a: unknown[]) => txClientQuery(...a) }),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/matching.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));

import { acceptOffer } from '../src/services/booking-offer.service';

beforeEach(() => txClientQuery.mockReset());

describe('E03 — acceptOffer does not clobber a paid booking', () => {
  it('assigns the provider but preserves the booking status (conditional matched, never unconditional)', async () => {
    const future = new Date(Date.now() + 60_000);
    txClientQuery
      // 1) SELECT offer ... FOR UPDATE (joined provider_user_id)
      .mockResolvedValueOnce({ rows: [{
        id: 'of1', booking_id: 'bk1', provider_id: 'pr1', status: 'pending',
        expires_at: future, provider_user_id: 'pu1',
      }] })
      .mockResolvedValueOnce({ rows: [] })  // 2) UPDATE offer accepted
      .mockResolvedValueOnce({ rows: [] })  // 3) UPDATE cancel sibling offers
      .mockResolvedValueOnce({ rows: [] }); // 4) UPDATE bookings

    const result = await acceptOffer('of1', 'pu1');
    expect(result).toEqual({ booking_id: 'bk1', provider_id: 'pr1' });

    const bookingUpdate = txClientQuery.mock.calls.find((c) => String(c[0]).includes('UPDATE bookings'));
    expect(bookingUpdate).toBeTruthy();
    const sql = String(bookingUpdate![0]);
    // Provider is assigned, and status only becomes 'matched' from pre-pay
    // states — a paid booking keeps its status.
    expect(sql).toMatch(/provider_id=\$1/);
    expect(sql).toMatch(/CASE WHEN status IN \('requested','quoted'\) THEN 'matched' ELSE status END/);
    // Regression guard: must NOT be the old unconditional clobber.
    expect(sql).not.toMatch(/status='matched'/);
  });
});
