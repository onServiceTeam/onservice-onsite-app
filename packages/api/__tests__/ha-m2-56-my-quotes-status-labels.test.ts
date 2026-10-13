// HA-M2-56 (customer human audit 2026-10-13, D38 Milestone 2, package P2): My
// quotes tells the provider what became of each quote, with all eight
// display statuses: waiting, accepted (customer has not paid yet), booked,
// declined (by the customer, with the reason), not_selected (the customer
// chose another pro: no reason is recorded), expired, withdrawn, and
// request_closed (the customer cancelled the request). The customer's decline
// note is never returned. Real HTTP through the mounted provider route over
// real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, insertQuote, providerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-56: My quotes maps all eight statuses', async () => {
  await withRequestFlowDatabase(async database => {
    const cases: Array<[string, { booking: Parameters<typeof insertQuoteRequest>[1]; quote: Omit<Parameters<typeof insertQuote>[1], 'bookingId' | 'providerId'> }]> = [
      ['waiting', { booking: { status: 'quoted' }, quote: {} }],
      ['accepted', { booking: { status: 'payment_pending' }, quote: { status: 'accepted' } }],
      ['booked', { booking: { status: 'paid' }, quote: { status: 'accepted' } }],
      ['declined', { booking: { status: 'requested', round: 2 }, quote: { status: 'declined', declineReason: 'timing' } }],
      ['not_selected', { booking: { status: 'payment_pending' }, quote: { status: 'declined' } }],
      ['expired', { booking: { status: 'requested', round: 2 }, quote: { status: 'expired', expiresAtSql: "NOW() - INTERVAL '1 hour'" } }],
      ['withdrawn', { booking: { status: 'requested', round: 2 }, quote: { status: 'withdrawn' } }],
      ['request_closed', { booking: { status: 'cancelled_by_customer' }, quote: {} }],
    ];
    const expected: Record<string, string> = {};
    for (const [label, spec] of cases) {
      const bookingId = await insertQuoteRequest(database, spec.booking);
      const quoteId = await insertQuote(database, { bookingId, providerId: providerA, ...spec.quote });
      if (label === 'accepted' || label === 'booked') {
        await database.query('UPDATE bookings SET provider_id = $1 WHERE id = $2', [providerA, bookingId]);
      }
      if (label === 'declined') {
        await database.query(`UPDATE booking_quotes SET decline_note = 'Call me on 0917 000 0000' WHERE id = $1`, [quoteId]);
      }
      expected[quoteId] = label;
    }

    const response = await flowHttp(providerUserA, 'provider').myQuotes('all');

    expect(response.status).toBe(200);
    const seen = Object.fromEntries((response.body.data as Array<{ quoteId: string; displayStatus: string }>)
      .map(q => [q.quoteId, q.displayStatus]));
    expect(seen).toEqual(expected);
    const declined = (response.body.data as Array<{ displayStatus: string; declineReason: string | null }>)
      .find(q => q.displayStatus === 'declined')!;
    expect(declined.declineReason).toBe('timing');
    expect((response.body.data as Array<{ displayStatus: string; declineReason: string | null }>)
      .find(q => q.displayStatus === 'not_selected')!.declineReason).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('0917');
  });
}, 90000);
