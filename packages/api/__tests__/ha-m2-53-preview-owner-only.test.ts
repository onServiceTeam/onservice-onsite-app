// HA-M2-53 (customer human audit 2026-10-13, D38 Milestone 2, package P2): the
// confirm preview of a quote is for the customer who owns the request. Another
// customer and the quoting provider both get 403 and no money figures. Real
// HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerB, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-53: the confirm preview refuses anyone but the owning customer', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const quoteId = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id;

    const otherCustomer = await flowHttp(customerB, 'customer').confirmPreview(bookingId, quoteId);
    const provider = await flowHttp(providerUserA, 'provider').confirmPreview(bookingId, quoteId);

    for (const response of [otherCustomer, provider]) {
      expect(response.status).toBe(403);
      expect(response.body.data).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('totalAmount');
    }
  });
}, 90000);
