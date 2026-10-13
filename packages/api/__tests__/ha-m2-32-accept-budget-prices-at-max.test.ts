// HA-M2-32 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// "Accept the customer's budget": a provider who sends acceptBudget with no
// price is quoted at the top of the customer's range (budget_max), decided by
// the server, and the quote records that it accepted the budget. Real HTTP on
// the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-32: acceptBudget prices the quote at budget_max', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { budgetMin: 60000, budgetMax: 90000 });
    const body = quoteBody({ acceptBudget: true });
    delete body.quotedPrice;

    const response = await flowHttp(providerUserA, 'provider').quote(bookingId, body);

    expect(response.status).toBe(201);
    expect((await database.query(`SELECT quoted_price::int AS price, accepted_customer_budget
      FROM booking_quotes WHERE id = $1`, [response.body.data.id])).rows).toEqual([{ price: 90000, accepted_customer_budget: true }]);
  });
}, 90000);
