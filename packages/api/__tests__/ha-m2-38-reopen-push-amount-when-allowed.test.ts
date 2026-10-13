// HA-M2-38 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// with the admin setting request_show_declined_amount turned on, the
// reopened-request notice to other providers also gives the amount the
// customer declined. Real HTTP and real notification rows on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, notificationsOf, upsertPlatformSetting,
  customerA, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-38: the declined amount is shown when request_show_declined_amount is on', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_show_declined_amount', 'true');
    const bookingId = await insertQuoteRequest(database);
    const quote = await flowHttp(providerUserA, 'provider').quote(bookingId);

    expect((await flowHttp(customerA, 'customer').decline(bookingId, quote.body.data.id, { reason: 'timing' })).status).toBe(200);

    const reopened = (await notificationsOf(database, providerUserB)).filter(n => n.type === 'job_request_reopened');
    expect(reopened.map(n => n.body)).toEqual([
      'A customer is looking for another pro: Aircon repair in Cebu City. They declined an earlier quote. '
        + 'Reason: Timing did not work. Declined amount: ₱800.00.',
    ]);
  });
}, 90000);
