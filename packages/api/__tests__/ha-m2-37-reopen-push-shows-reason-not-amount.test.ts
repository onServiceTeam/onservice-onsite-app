// HA-M2-37 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// when a decline reopens a request, the other eligible providers are told
// "the customer declined an earlier quote" with the reason, and with
// request_show_declined_amount off (the default) never the declined amount.
// The declined provider is not sent the reopened request. Real HTTP and real
// notification rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, addProvider, notificationsOf, invitesOf,
  customerA, providerA, providerB, providerC, providerUserA, providerUserB, providerUserC,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-37: the reopen push excludes the declined provider, shows the reason and no amount', async () => {
  await withRequestFlowDatabase(async database => {
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    const bookingId = await insertQuoteRequest(database);
    const quote = await flowHttp(providerUserA, 'provider').quote(bookingId);

    expect((await flowHttp(customerA, 'customer').decline(bookingId, quote.body.data.id, { reason: 'too_expensive' })).status).toBe(200);

    const expectedBody = 'A customer is looking for another pro: Aircon repair in Cebu City. They declined an earlier quote. Reason: Price too high.';
    for (const userId of [providerUserB, providerUserC]) {
      const reopened = (await notificationsOf(database, userId)).filter(n => n.type === 'job_request_reopened');
      expect(reopened).toHaveLength(1);
      expect(reopened[0]!.body).toBe(expectedBody);
      expect(reopened[0]!.body).not.toMatch(/800|₱/);
    }
    expect((await notificationsOf(database, providerUserA)).map(n => n.type)).toEqual(['quote_declined']);
    expect((await invitesOf(database, bookingId)).filter(i => i.round === 2).map(i => i.provider_id).sort())
      .toEqual([providerB, providerC].sort());
    expect((await invitesOf(database, bookingId)).some(i => i.provider_id === providerA && i.round === 2)).toBe(false);
  });
}, 90000);
