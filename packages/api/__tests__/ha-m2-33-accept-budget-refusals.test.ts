// HA-M2-33 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// acceptBudget is refused when there is no budget to accept (the customer
// chose "Not sure"), with 400 ACCEPT_BUDGET_UNAVAILABLE, and when the price
// sent with it is not the top of the customer's range, with 400
// ACCEPT_BUDGET_PRICE_MISMATCH. Nothing is stored either time. Real HTTP on
// the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-33: acceptBudget is refused when the budget is unknown or the price differs', async () => {
  await withRequestFlowDatabase(async database => {
    const unsure = await insertQuoteRequest(database, { budgetUnknown: true });
    const ranged = await insertQuoteRequest(database, { budgetMin: 60000, budgetMax: 90000 });
    const provider = flowHttp(providerUserA, 'provider');
    const noPrice = quoteBody({ acceptBudget: true });
    delete noPrice.quotedPrice;

    const unknownBudget = await provider.quote(unsure, noPrice);
    const differentPrice = await provider.quote(ranged, quoteBody({ acceptBudget: true, quotedPrice: 85000 }));

    expect(unknownBudget.status).toBe(400);
    expect(unknownBudget.body.error.code).toBe('ACCEPT_BUDGET_UNAVAILABLE');
    expect(differentPrice.status).toBe(400);
    expect(differentPrice.body.error.code).toBe('ACCEPT_BUDGET_PRICE_MISMATCH');
    expect((await database.query('SELECT COUNT(*)::int AS n FROM booking_quotes')).rows[0].n).toBe(0);
  });
}, 90000);
