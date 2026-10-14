// HA-M3-35 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 97): a lost request's estimated value is the
// midpoint of the customer's budget when both ends were given, the one end
// given otherwise, and null when the customer chose "Not sure"
// (budget_unknown). The summary adds up the known values (no invented number
// for the unknown one) and counts the requests without a budget. Real HTTP on
// the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import {
  adminUser, closeAsExpired, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-35: estimated value is the budget midpoint, one given end, or null when the budget is unknown', async () => {
  await withMarketplaceDatabase(async database => {
    const both = await insertQuoteRequest(database, { createdAgo: '3 hours', budgetMin: 100000, budgetMax: 200000 });
    const maxOnly = await insertQuoteRequest(database, { createdAgo: '3 hours', budgetMax: 80000 });
    const unknown = await insertQuoteRequest(database, { createdAgo: '3 hours', budgetUnknown: true });
    for (const id of [both, maxOnly, unknown]) await closeAsExpired(database, id);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/lost-opportunities');

    expect(response.status).toBe(200);
    const values = Object.fromEntries(response.body.data.map((row: { bookingId: string; estimatedValueCentavos: number | null }) =>
      [row.bookingId, row.estimatedValueCentavos]));
    expect(values).toEqual({ [both]: 150000, [maxOnly]: 80000, [unknown]: null });
    expect(response.body.meta.summary).toMatchObject({ total: 3, estimatedValueCentavos: 230000, withoutBudget: 1 });
  });
}, 90000);
