// HA-M3-16 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 81 with the merged.md rename: needs-ops is
// request_ops_review_at): when the engine flags a request for back-office
// review, the sweep raises one request_needs_ops alert carrying the flag's
// reason. Here a real job request is posted while both eligible providers are
// offline, so the real round-1 fan-out finds nobody and flags
// no_eligible_providers (as in HA-M2-46). Real HTTP and real SQL on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { customerA, flowHttp, providerA, providerB, waitUntil } from './helpers/request-flow-postgres';
import { jobRequestBody, quoteService } from './helpers/job-request-postgres';
import { alertsOf, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-16: a request flagged for back-office review raises request_needs_ops', async () => {
  await withMarketplaceDatabase(async database => {
    await database.query('UPDATE providers SET is_available = FALSE WHERE id IN ($1, $2)', [providerA, providerB]);
    const created = await flowHttp(customerA, 'customer').jobRequest(jobRequestBody({ subcategoryId: quoteService }));
    expect(created.status).toBe(201);
    const bookingId = created.body.data.id as string;
    await waitUntil(async () => (await database.query(
      'SELECT 1 FROM bookings WHERE id = $1 AND request_ops_review_at IS NOT NULL', [bookingId],
    )).rows.length === 1, 'the back-office flag');

    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });

    expect(await alertsOf(database, bookingId)).toEqual([{
      booking_id: bookingId, kind: 'request_needs_ops', request_round: 1, threshold_minutes: null,
      resolution: null, open: true, acknowledged: false,
    }]);
    expect((await database.query('SELECT details FROM marketplace_alerts WHERE booking_id = $1', [bookingId])).rows[0].details)
      .toMatchObject({ reason: 'no_eligible_providers', notified: 0 });
  });
}, 90000);
