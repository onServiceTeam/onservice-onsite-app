// HA-M2-14 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// now that the state machine allows quoted -> requested, a customer still
// cannot reopen their own quoted request through PATCH /bookings/:id/status:
// 'requested' stays a flow-only target (409 BOOKING_TRANSITION_FLOW_ONLY) and
// nothing is written. Real HTTP through the mounted booking router on the
// guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, participantHttp, providerA,
} from './helpers/booking-participant-postgres';
import { quoteService, requestCategory } from './helpers/job-request-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const quotedRequest = '83000000-0000-4000-8000-000000000141';

it('HA-M2-14: a customer PATCH from quoted to requested is still refused as flow-only and writes nothing', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id, description)
      VALUES ($1, $2, 'quote_based', 'quoted', $3, $4, 'Aircon makes a grinding noise')`,
    [quotedRequest, customerA, requestCategory, quoteService]);
    await database.query(`INSERT INTO booking_quotes (booking_id, provider_id, quoted_price, status, expires_at)
      VALUES ($1, $2, 120000, 'submitted', NOW() + INTERVAL '1 day')`, [quotedRequest, providerA]);
    const state = async () => ({
      booking: (await database.query('SELECT * FROM bookings WHERE id = $1', [quotedRequest])).rows,
      quotes: (await database.query('SELECT * FROM booking_quotes WHERE booking_id = $1', [quotedRequest])).rows,
      notifications: (await database.query('SELECT count(*)::int AS n FROM notifications')).rows,
    });
    const before = await state();

    const response = await participantHttp(customerA, 'customer')(quotedRequest, 'requested');

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: 'BOOKING_TRANSITION_FLOW_ONLY',
      message: 'This booking change can\'t be made from here.',
    });
    expect(await state()).toEqual(before);
  });
}, 90000);
