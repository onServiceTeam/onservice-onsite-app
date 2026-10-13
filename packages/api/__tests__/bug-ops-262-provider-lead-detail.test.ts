// Bug OPS-262: an eligible provider must be able to open a quote lead's
// detail (to price it) without the assigned-booking endpoint, and the lead
// must be redacted: area only, no street address or map pin.
//
// D38 Milestone 2 (package P2) rewrite. The detail now applies the shared
// eligibility rule and the open-quote cap, and the customer's name is shown
// as first name and last initial ("Ana R.", merged plan 2.3; it was the full
// name). Before this rewrite the test mocked the SQL calls and asserted on
// SQL text; it now calls the mounted provider route over real rows on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug OPS-262 — an eligible provider can open a redacted quote lead without using the assigned-booking endpoint', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { budgetMin: 50000, budgetMax: 150000 });

    const response = await flowHttp(providerUserA, 'provider').lead(bookingId);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: bookingId,
      categoryName: 'Aircon Services',
      serviceName: 'Aircon repair',
      customerName: 'Ana R.',
      barangay: 'Kamputhaw',
      city: 'Cebu City',
      budgetMin: 50000,
      budgetMax: 150000,
      myQuote: null,
    });
    // Provider A sits about 2.25 km from the request pin; shown to 0.1 km.
    expect(response.body.data.distanceKm).toBe(2.3);
    expect(response.body.data).not.toHaveProperty('address');
    expect(response.body.data).not.toHaveProperty('latitude');
    expect(response.body.data).not.toHaveProperty('longitude');
    expect(JSON.stringify(response.body.data)).not.toContain('22 Mango Avenue');
    expect(JSON.stringify(response.body.data)).not.toContain('Reyes');
  });
}, 90000);
