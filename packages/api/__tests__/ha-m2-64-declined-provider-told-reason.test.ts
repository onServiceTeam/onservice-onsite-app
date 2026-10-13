// HA-M2-64 (customer human audit 2026-10-13, D38 Milestone 2, package P2): the
// provider whose quote the customer declined is told, with the reason's label
// and never the customer's note (which may hold contact details). Real HTTP
// and real notification rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, notificationsOf, customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-64: the declined provider gets quote_declined with the reason label', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const quoteId = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id;

    await flowHttp(customerA, 'customer').decline(bookingId, quoteId, { reason: 'timing', note: 'Text me on 0917 123 4567' });

    const declined = (await notificationsOf(database, providerUserA)).filter(n => n.type === 'quote_declined');
    expect(declined).toHaveLength(1);
    expect(declined[0]).toMatchObject({
      title: 'Quote declined',
      body: 'The customer declined your quote for Aircon repair. Reason: Timing did not work.',
      data: expect.objectContaining({ bookingId, quoteId, reason: 'timing' }),
    });
    expect(JSON.stringify(declined)).not.toContain('0917');
  });
}, 90000);
