// HA-M2-36 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// declining the only live quote reopens the request: it goes back to
// 'requested' in round 2 with a fresh round clock and one declined round
// counted, and the quote keeps the customer's reason, note and decline time.
// Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-36: a decline reopens the request: requested, round 2, reason and declined_at stored', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const quote = await flowHttp(providerUserA, 'provider').quote(bookingId);

    const response = await flowHttp(customerA, 'customer').decline(bookingId, quote.body.data.id, {
      reason: 'too_expensive', note: 'Another shop quoted less.',
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      quoteId: quote.body.data.id, bookingStatus: 'requested', round: 2, reopened: true, opsReview: false,
    });
    expect((await database.query(`SELECT status, request_round, request_declined_rounds,
        request_round_opened_at > NOW() - INTERVAL '1 minute' AS round_reopened_now
      FROM bookings WHERE id = $1`, [bookingId])).rows)
      .toEqual([{ status: 'requested', request_round: 2, request_declined_rounds: 1, round_reopened_now: true }]);
    expect((await database.query(`SELECT status, decline_reason, decline_note, declined_at IS NOT NULL AS declined
      FROM booking_quotes WHERE id = $1`, [quote.body.data.id])).rows)
      .toEqual([{ status: 'declined', decline_reason: 'too_expensive', decline_note: 'Another shop quoted less.', declined: true }]);
  });
}, 90000);
