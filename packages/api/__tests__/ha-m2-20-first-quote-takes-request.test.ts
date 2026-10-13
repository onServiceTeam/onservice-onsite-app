// HA-M2-20 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// with request_max_open_quotes at its default of 1, the first provider's
// quote takes the request. A second provider's quote is refused with 409
// REQUEST_TAKEN and nothing of theirs is stored. Real HTTP through the
// mounted booking router on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, providerA, providerB, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-20: at cap 1 the second provider gets 409 REQUEST_TAKEN and nothing of theirs is stored', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);

    const first = await flowHttp(providerUserA, 'provider').quote(bookingId);
    expect(first.status).toBe(201);

    const second = await flowHttp(providerUserB, 'provider').quote(bookingId);

    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: 'REQUEST_TAKEN',
      message: 'Another pro already responded to this request.',
    });
    expect((await database.query(`SELECT provider_id, status FROM booking_quotes WHERE booking_id = $1`,
      [bookingId])).rows).toEqual([{ provider_id: providerA, status: 'submitted' }]);
    expect((await database.query(`SELECT COUNT(*)::int AS n FROM job_request_invites
      WHERE booking_id = $1 AND provider_id = $2`, [bookingId, providerB])).rows[0].n).toBe(0);
    expect((await database.query('SELECT status FROM bookings WHERE id = $1', [bookingId])).rows[0].status).toBe('quoted');
  });
}, 90000);
