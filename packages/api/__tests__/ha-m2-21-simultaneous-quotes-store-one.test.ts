// HA-M2-21 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// two providers sending a quote for the same request at the same moment end
// with exactly one stored quote. Quote admission locks the request row FOR
// UPDATE, so the second transaction waits, then sees the first live quote and
// is refused with 409 REQUEST_TAKEN. Real concurrent HTTP requests on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-21: simultaneous submits from two providers store exactly one quote', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);

    const responses = await Promise.all([
      flowHttp(providerUserA, 'provider').quote(bookingId),
      flowHttp(providerUserB, 'provider').quote(bookingId),
    ]);

    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(responses.find(r => r.status === 409)!.body.error.code).toBe('REQUEST_TAKEN');
    const quotes = await database.query('SELECT id, status FROM booking_quotes WHERE booking_id = $1', [bookingId]);
    expect(quotes.rows).toEqual([{ id: responses.find(r => r.status === 201)!.body.data.id, status: 'submitted' }]);
  });
}, 90000);
