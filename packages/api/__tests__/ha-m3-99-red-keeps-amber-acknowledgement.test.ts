// HA-M3-99 (customer human audit 2026-10-13, D38 Milestone 3, integrated
// review 2026-10-14): when an acknowledged amber alert turns red, the red
// alert keeps who is handling it and since when, so the banner does not show
// the request as unhandled and a second staff member does not call the same
// providers again. The amber is still closed as escalated. Real sweep and
// real acknowledge route on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-99: an acknowledged amber that turns red hands its acknowledgement to the red alert', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    await sweepMarketplaceAlerts();
    const amberId = (await database.query<{ id: string }>(
      `SELECT id FROM marketplace_alerts WHERE kind = 'request_waiting_amber'`)).rows[0]!.id;
    const acknowledged = await marketplaceAdminHttp(adminUser, 'admin').post(`/alerts/${amberId}/acknowledge`, {});
    expect(acknowledged.status).toBe(200);
    const amberAcknowledgedAt = (await database.query<{ at: Date }>(
      'SELECT acknowledged_at AS at FROM marketplace_alerts WHERE id = $1', [amberId])).rows[0]!.at;

    // The wait reaches 11 minutes with still no quote.
    await database.query(`UPDATE bookings SET request_round_opened_at = NOW() - INTERVAL '11 minutes' WHERE id = $1`, [bookingId]);
    await sweepMarketplaceAlerts();

    const rows = (await database.query(`SELECT kind, acknowledged_by, acknowledged_at, resolution, resolved_at IS NULL AS open
      FROM marketplace_alerts WHERE booking_id = $1 ORDER BY raised_at, kind`, [bookingId])).rows;
    expect(rows).toEqual([
      { kind: 'request_waiting_amber', acknowledged_by: adminUser, acknowledged_at: amberAcknowledgedAt, resolution: 'escalated', open: false },
      { kind: 'request_waiting_red', acknowledged_by: adminUser, acknowledged_at: amberAcknowledgedAt, resolution: null, open: true },
    ]);
  });
}, 90000);
