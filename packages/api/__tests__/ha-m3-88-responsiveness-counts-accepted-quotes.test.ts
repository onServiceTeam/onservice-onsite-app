// HA-M3-88 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// review finding on the M3-API build): provider responsiveness reports how
// many of the provider's responses the customer accepted. Provider A answered
// two requests in the range; the customer accepted one quote (the accept path
// leaves that invite 'quoted' and marks the quote accepted) and the other is
// still live, so GET /admin/marketplace-health/providers reports 2 responses
// and quotesAccepted 1. Real HTTP on the guarded PostgreSQL fixture.
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import {
  adminUser, insertInvite, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function answeredRequest(database: Pool, accepted: boolean): Promise<void> {
  const bookingId = await insertQuoteRequest(database, { status: 'quoted', createdAgo: '2 hours' });
  const quoteId = await insertQuote(database, { bookingId, providerId: providerA, ...(accepted ? { status: 'accepted' } : {}) });
  if (accepted) {
    await database.query('UPDATE booking_quotes SET is_accepted = TRUE WHERE id = $1', [quoteId]);
    await database.query("UPDATE bookings SET status = 'confirmed', provider_id = $2 WHERE id = $1", [bookingId, providerA]);
  }
  await insertInvite(database, {
    bookingId, providerId: providerA, status: 'quoted', sentAgo: '90 minutes', viewedAfterMinutes: 2,
    respondedAfterMinutes: 10, quoteId,
  });
}

it('HA-M3-88: responsiveness counts the provider responses whose quote was accepted', async () => {
  await withMarketplaceDatabase(async database => {
    await answeredRequest(database, true);
    await answeredRequest(database, false);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/providers');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({ providerId: providerA, invites: 2, responded: 2, quotesAccepted: 1 }),
    ]);
  });
}, 90000);
