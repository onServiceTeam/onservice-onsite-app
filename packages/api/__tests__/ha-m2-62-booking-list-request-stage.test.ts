// HA-M2-62 (customer human audit 2026-10-13, D38 Milestone 2, package P2): in
// the customer's booking list, a quote request carries its stage and live
// quote count (so the Bookings tab can say "Quote to review" instead of a 0
// price), from the same SQL as request-status. A fixed-price booking carries
// neither. Real HTTP through the mounted booking list on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-62: booking-list rows of quote requests carry requestStage and openQuoteCount', async () => {
  await withRequestFlowDatabase(async database => {
    const requestId = await insertQuoteRequest(database);
    const fixedId = await insertQuoteRequest(database, { bookingType: 'fixed_price' });
    await flowHttp(providerUserA, 'provider').quote(requestId);

    const response = await flowHttp(customerA, 'customer').bookings();

    expect(response.status).toBe(200);
    const byId = Object.fromEntries((response.body.data as Array<{ id: string }>).map(b => [b.id, b]));
    expect(byId[requestId]).toMatchObject({ bookingType: 'quote_based', requestStage: 'quote_ready', openQuoteCount: 1 });
    expect(byId[fixedId]).toMatchObject({ bookingType: 'fixed_price' });
    expect(byId[fixedId]).not.toHaveProperty('requestStage');
    expect(byId[fixedId]).not.toHaveProperty('openQuoteCount');
  });
}, 90000);
