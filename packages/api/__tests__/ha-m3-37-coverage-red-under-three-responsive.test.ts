// HA-M3-37 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 99): the coverage grid marks an area and category
// below threshold when fewer approved providers than
// ops_coverage_min_responsive_providers (3) sent a quote there in the last 7
// days, and only then. In Cebu City, three approved providers offer aircon
// services; A and B quoted aircon requests this week and C's only aircon
// quote is 8 days old, so that cell has 3 approved, 2 responsive and is below
// threshold. The same three also offer plumbing and each quoted a plumbing
// request this week, so the plumbing cell has 3 responsive and is not below
// threshold (the review showed the test could not tell "red under 3" from
// "always red" without a cell at 3). Electrical, with no provider, is below
// threshold too. Real HTTP on the guarded PostgreSQL fixture.
import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  addProvider, insertQuote, insertQuoteRequest, providerA, providerB, providerC, providerUserC, requestCategory,
} from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function quotedDaysAgo(database: Pool, providerId: string, days: number, categoryId?: string): Promise<void> {
  const bookingId = await insertQuoteRequest(database, { status: 'quoted', createdAgo: `${days} days` });
  if (categoryId) {
    await database.query('UPDATE bookings SET category_id = $2, subcategory_id = NULL WHERE id = $1', [bookingId, categoryId]);
  }
  const quoteId = await insertQuote(database, { bookingId, providerId });
  await database.query(`UPDATE booking_quotes SET created_at = NOW() - make_interval(days => $2::int) WHERE id = $1`,
    [quoteId, days]);
}

it('HA-M3-37: a cell is below a threshold of 3 with 2 responsive providers and not with 3; an 8-day-old quote does not count', async () => {
  await withMarketplaceDatabase(async database => {
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    const cebu = (await database.query<{ id: string }>("SELECT id FROM service_areas WHERE name = 'Cebu City'")).rows[0]!.id;
    for (const providerId of [providerA, providerB, providerC]) {
      await database.query('INSERT INTO provider_service_areas (provider_id, service_area_id, is_primary) VALUES ($1, $2, TRUE)',
        [providerId, cebu]);
    }
    const plumbing = crypto.randomUUID();
    const electrical = crypto.randomUUID();
    await database.query("INSERT INTO service_categories (id, name) VALUES ($1, 'Plumbing'), ($2, 'Electrical')",
      [plumbing, electrical]);
    for (const providerId of [providerA, providerB, providerC]) {
      await database.query('INSERT INTO provider_services (provider_id, category_id) VALUES ($1, $2)', [providerId, plumbing]);
    }
    await quotedDaysAgo(database, providerA, 2);
    await quotedDaysAgo(database, providerB, 6);
    await quotedDaysAgo(database, providerC, 8);
    await quotedDaysAgo(database, providerA, 1, plumbing);
    await quotedDaysAgo(database, providerB, 3, plumbing);
    await quotedDaysAgo(database, providerC, 6, plumbing);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/coverage');

    expect(response.status).toBe(200);
    expect(response.body.data.threshold).toBe(3);
    expect(response.body.data.areas).toEqual([{ id: cebu, name: 'Cebu City', status: 'active' }]);
    expect(response.body.data.cells).toEqual([
      {
        areaId: cebu, categoryId: requestCategory,
        approvedProviders: 3, responsiveProviders: 2, requests30d: 3, belowThreshold: true,
      },
      { areaId: cebu, categoryId: electrical, approvedProviders: 0, responsiveProviders: 0, requests30d: 0, belowThreshold: true },
      { areaId: cebu, categoryId: plumbing, approvedProviders: 3, responsiveProviders: 3, requests30d: 3, belowThreshold: false },
    ]);
  });
}, 90000);
