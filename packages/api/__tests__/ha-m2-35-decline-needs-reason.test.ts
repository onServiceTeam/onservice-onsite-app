// HA-M2-35 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// declining a quote needs a reason. A decline with no reason (what APK 1.0.3
// and older send) gets 400 APP_UPDATE_REQUIRED, and the quote stays live: it
// is still 'submitted', the request is still 'quoted', and the customer can
// still accept it. Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-35: a decline without a reason is refused and the quote stays live', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const quote = await flowHttp(providerUserA, 'provider').quote(bookingId);
    expect(quote.status).toBe(201);

    const response = await flowHttp(customerA, 'customer').decline(bookingId, quote.body.data.id, {});

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'APP_UPDATE_REQUIRED',
      message: 'Please update the onService app to decline a quote.',
    });
    expect((await database.query(`SELECT q.status, q.decline_reason, q.declined_at, b.status AS booking_status,
        q.expires_at > NOW() AS live
      FROM booking_quotes q JOIN bookings b ON b.id = q.booking_id WHERE q.id = $1`, [quote.body.data.id])).rows)
      .toEqual([{ status: 'submitted', decline_reason: null, declined_at: null, booking_status: 'quoted', live: true }]);
  });
}, 90000);
