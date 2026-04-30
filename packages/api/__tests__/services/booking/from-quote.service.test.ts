// Phase 14 Dispatch 05 — from-quote.service.ts tests (Bug 175 quote path).
//
// Verifies that quote-acceptance pricing is read from
// `booking_quotes.quoted_price` server-side, not from any client input.

jest.mock('../../../src/models/db', () => ({
  db: { query: jest.fn() },
}));

import { db } from '../../../src/models/db';
import { validateAndResolveQuote } from '../../../src/services/booking/from-quote.service';

const mockedQuery = db.query as jest.MockedFunction<typeof db.query>;

const BOOKING_ID = '11111111-1111-1111-1111-111111111111';
const QUOTE_ID = '22222222-2222-2222-2222-222222222222';
const CUSTOMER_ID = '33333333-3333-3333-3333-333333333333';
const OTHER_CUSTOMER_ID = '44444444-4444-4444-4444-444444444444';
const OTHER_BOOKING_ID = '55555555-5555-5555-5555-555555555555';
const PROVIDER_ID = '66666666-6666-6666-6666-666666666666';

const BOOKING_REQUESTED = {
  id: BOOKING_ID,
  customer_id: CUSTOMER_ID,
  status: 'requested',
};
const BOOKING_QUOTED = { ...BOOKING_REQUESTED, status: 'quoted' };
const BOOKING_PAID = { ...BOOKING_REQUESTED, status: 'paid' };
const BOOKING_OWNED_BY_OTHER = { ...BOOKING_REQUESTED, customer_id: OTHER_CUSTOMER_ID };

const QUOTE_VALID = {
  id: QUOTE_ID,
  booking_id: BOOKING_ID,
  provider_id: PROVIDER_ID,
  quoted_price: 250000,
  expires_at: new Date(Date.now() + 86400_000).toISOString(),
  is_accepted: false,
  status: 'submitted',
};

interface QueryStub {
  match: RegExp;
  rows: unknown[];
}

function setupQueries(...stubs: QueryStub[]) {
  mockedQuery.mockImplementation((async (text: string) => {
    for (const stub of stubs) {
      if (stub.match.test(text)) {
        return {
          rows: stub.rows,
          rowCount: stub.rows.length,
          command: '',
          oid: 0,
          fields: [],
        };
      }
    }
    throw new Error(`from-quote.service.test: unexpected query: ${text}`);
  }) as never);
}

const baseInput = { bookingId: BOOKING_ID, quoteId: QUOTE_ID, customerId: CUSTOMER_ID };

beforeEach(() => {
  mockedQuery.mockReset();
});

describe('Bug 175 (quote path) — validateAndResolveQuote', () => {
  it('bug-175-uses-quote-amount-not-client: returns quoted_price as canonical', async () => {
    setupQueries(
      { match: /FROM bookings/i, rows: [BOOKING_REQUESTED] },
      { match: /FROM booking_quotes/i, rows: [QUOTE_VALID] },
    );
    const result = await validateAndResolveQuote(baseInput);
    expect(result.servicePriceCents).toBe(250000);
    expect(result.providerId).toBe(PROVIDER_ID);
    expect(result.bookingId).toBe(BOOKING_ID);
    expect(result.quoteId).toBe(QUOTE_ID);
  });

  it('accepts booking in `quoted` state', async () => {
    setupQueries(
      { match: /FROM bookings/i, rows: [BOOKING_QUOTED] },
      { match: /FROM booking_quotes/i, rows: [QUOTE_VALID] },
    );
    const result = await validateAndResolveQuote(baseInput);
    expect(result.servicePriceCents).toBe(250000);
  });
});

describe('validateAndResolveQuote — booking validation', () => {
  it('rejects unknown booking', async () => {
    setupQueries({ match: /FROM bookings/i, rows: [] });
    await expect(validateAndResolveQuote(baseInput)).rejects.toThrow(/booking_not_found/);
  });

  it('rejects booking owned by another customer', async () => {
    setupQueries({ match: /FROM bookings/i, rows: [BOOKING_OWNED_BY_OTHER] });
    await expect(validateAndResolveQuote(baseInput)).rejects.toThrow(/booking_not_for_user/);
  });

  it('rejects booking in non-quote-able state (paid)', async () => {
    setupQueries({ match: /FROM bookings/i, rows: [BOOKING_PAID] });
    await expect(validateAndResolveQuote(baseInput)).rejects.toThrow(
      /booking_wrong_state_for_quote/,
    );
  });
});

describe('validateAndResolveQuote — quote validation', () => {
  it('rejects unknown quote', async () => {
    setupQueries(
      { match: /FROM bookings/i, rows: [BOOKING_REQUESTED] },
      { match: /FROM booking_quotes/i, rows: [] },
    );
    await expect(validateAndResolveQuote(baseInput)).rejects.toThrow(/quote_not_found/);
  });

  it('rejects quote belonging to a different booking', async () => {
    setupQueries(
      { match: /FROM bookings/i, rows: [BOOKING_REQUESTED] },
      { match: /FROM booking_quotes/i, rows: [{ ...QUOTE_VALID, booking_id: OTHER_BOOKING_ID }] },
    );
    await expect(validateAndResolveQuote(baseInput)).rejects.toThrow(/quote_wrong_booking/);
  });

  it('rejects expired quote', async () => {
    setupQueries(
      { match: /FROM bookings/i, rows: [BOOKING_REQUESTED] },
      {
        match: /FROM booking_quotes/i,
        rows: [{ ...QUOTE_VALID, expires_at: new Date(Date.now() - 1000).toISOString() }],
      },
    );
    await expect(validateAndResolveQuote(baseInput)).rejects.toThrow(/quote_expired/);
  });

  it('rejects quote in declined status', async () => {
    setupQueries(
      { match: /FROM bookings/i, rows: [BOOKING_REQUESTED] },
      { match: /FROM booking_quotes/i, rows: [{ ...QUOTE_VALID, status: 'declined' }] },
    );
    await expect(validateAndResolveQuote(baseInput)).rejects.toThrow(/quote_wrong_status/);
  });

  it('rejects quote in withdrawn status', async () => {
    setupQueries(
      { match: /FROM bookings/i, rows: [BOOKING_REQUESTED] },
      { match: /FROM booking_quotes/i, rows: [{ ...QUOTE_VALID, status: 'withdrawn' }] },
    );
    await expect(validateAndResolveQuote(baseInput)).rejects.toThrow(/quote_wrong_status/);
  });

  it('rejects quote with invalid (negative) quoted_price', async () => {
    setupQueries(
      { match: /FROM bookings/i, rows: [BOOKING_REQUESTED] },
      { match: /FROM booking_quotes/i, rows: [{ ...QUOTE_VALID, quoted_price: -100 }] },
    );
    await expect(validateAndResolveQuote(baseInput)).rejects.toThrow(/quote_not_found/);
  });
});
