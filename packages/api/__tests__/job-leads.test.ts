/**
 * D27 Phase 1 — custom-quote lead discovery (job-leads.service).
 *
 * D38 Milestone 2 (package P2) rewrite. The file used to mock db.query and
 * assert on SQL text. Its four cases are now covered as follows:
 *   - "notifies every matched provider and returns the count" and "matches by
 *     category + service radius": REPLACED by the real-database fan-out tests
 *     HA-M2-41 (ranked and capped at request_max_invites), HA-M2-42 (offline
 *     and rating-floor providers skipped), HA-M2-43 (a second run pushes
 *     nothing), HA-M2-27 (a provider without coordinates is not notified),
 *     HA-M2-46 (no candidate flags the request) and HA-M2-309 (concurrent
 *     runs). The fan-out no longer notifies "every matched provider": it
 *     ranks them and records an invite per provider. The old "matches by
 *     category" case also asserted, as SQL text, that a provider serving
 *     only a subcategory of the request's category matches; that roll-up is
 *     now HA-M2-314 (invited, sees the lead, admitted to quote, on real rows).
 *   - "404s when the caller has no provider profile" and "maps rows, rounds
 *     distance, and excludes already-quoted/accepted requests": KEPT below,
 *     now on the guarded PostgreSQL fixture with real rows. The customer name
 *     is now first name and last initial (HA-M2-58).
 */
import { bookingIntegrationIt as it, customerB } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, insertQuote, providerA, providerB, providerUserA,
} from './helpers/request-flow-postgres';
import * as svc from '../src/services/job-leads.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('getOpenJobRequestsForProvider', () => {
  it('404s when the caller has no provider profile', async () => {
    await withRequestFlowDatabase(async () => {
      await expect(svc.getOpenJobRequestsForProvider(customerB)).rejects.toMatchObject({ statusCode: 404 });
    });
  }, 90000);

  it('maps rows, rounds distance, and excludes already-quoted/accepted requests', async () => {
    await withRequestFlowDatabase(async database => {
      const open = await insertQuoteRequest(database, { budgetMin: 50000, budgetMax: 150000 });
      const alreadyQuotedByA = await insertQuoteRequest(database);
      await insertQuote(database, { bookingId: alreadyQuotedByA, providerId: providerA });
      const acceptedElsewhere = await insertQuoteRequest(database, { status: 'quoted' });
      await insertQuote(database, { bookingId: acceptedElsewhere, providerId: providerB, status: 'accepted' });

      const out = await svc.getOpenJobRequestsForProvider(providerUserA, { page: 1, pageSize: 20 });

      expect(out.total).toBe(1);
      expect(out.requests).toHaveLength(1);
      expect(out.requests[0]).toMatchObject({
        id: open,
        categoryName: 'Aircon Services',
        serviceName: 'Aircon repair',
        customerName: 'Ana R.',
        distanceKm: 2.3, // 2.254 km, rounded to 1 dp
        budgetMin: 50000,
        budgetMax: 150000,
      });
    });
  }, 90000);
});
