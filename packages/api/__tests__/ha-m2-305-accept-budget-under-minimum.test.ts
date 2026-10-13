// HA-M2-305 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique L1): "Accept the customer's budget" cannot create a quote below the
// platform minimum (₱100, 10,000 centavos). A customer budget topping out at
// ₱50 is refused with 400 ACCEPT_BUDGET_UNAVAILABLE and nothing is stored.
// Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-305: acceptBudget is refused when budget_max is under the minimum quote', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { budgetMin: 2000, budgetMax: 5000 });
    const body = quoteBody({ acceptBudget: true });
    delete body.quotedPrice;

    const response = await flowHttp(providerUserA, 'provider').quote(bookingId, body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ACCEPT_BUDGET_UNAVAILABLE');
    expect((await database.query('SELECT COUNT(*)::int AS n FROM booking_quotes WHERE booking_id = $1', [bookingId])).rows[0].n).toBe(0);
  });
}, 90000);
