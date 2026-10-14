// HA-M3-94 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md 4.1; review finding on the M3-API build): a request whose
// quote the customer accepted was booked, so it is not a lost opportunity
// even if the booking was cancelled later. Of two requests the customer
// cancelled, only the one that never had an accepted quote is listed, and
// the summary counts 1. Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import {
  adminUser, closeByCustomer, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-94: a cancelled booking whose quote was accepted is not a lost opportunity', async () => {
  await withMarketplaceDatabase(async database => {
    const booked = await insertQuoteRequest(database, { createdAgo: '3 hours' });
    const quoteId = await insertQuote(database, { bookingId: booked, providerId: providerA, status: 'accepted' });
    await database.query('UPDATE booking_quotes SET is_accepted = TRUE WHERE id = $1', [quoteId]);
    await database.query('UPDATE bookings SET provider_id = $2 WHERE id = $1', [booked, providerA]);
    await closeByCustomer(database, booked);
    const unbooked = await insertQuoteRequest(database, { createdAgo: '3 hours' });
    await closeByCustomer(database, unbooked);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/lost-opportunities');

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: Record<string, unknown>) => row.bookingId)).toEqual([unbooked]);
    expect(response.body.meta).toMatchObject({ total: 1, summary: { total: 1 } });
  });
}, 90000);
