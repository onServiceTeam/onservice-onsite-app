// HA-M3-23 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 87): an admin acknowledging an alert through POST
// /admin/marketplace-health/alerts/:id/acknowledge records who and when on the
// alert and writes exactly one marketplace_alert_acknowledged admin_actions
// row on the booking with the alert id, kind, round and the admin's note; a
// second acknowledgement of the same alert is refused with 409 and writes no
// second audit row. Real HTTP on the guarded PostgreSQL fixture with the real
// migration 186 constraint.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-23: acknowledge records who and when, writes one audit row, and a repeat is 409', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    await sweepMarketplaceAlerts();
    const alertId = (await database.query<{ id: string }>('SELECT id FROM marketplace_alerts')).rows[0]!.id;
    const http = marketplaceAdminHttp(adminUser, 'admin');

    const acknowledged = await http.post(`/alerts/${alertId}/acknowledge`, { note: '  Calling the two nearest pros now.  ' });

    expect(acknowledged.status).toBe(200);
    expect(acknowledged.body.data).toMatchObject({
      id: alertId, bookingId, kind: 'request_waiting_amber', severity: 'amber', round: 1,
      acknowledgedBy: { id: adminUser, name: 'Ada Admin' }, acknowledgedAt: expect.any(String),
      resolvedAt: null, resolution: null,
    });
    expect((await database.query(`SELECT acknowledged_by, acknowledged_at IS NOT NULL AS acknowledged, resolved_at
      FROM marketplace_alerts WHERE id = $1`, [alertId])).rows)
      .toEqual([{ acknowledged_by: adminUser, acknowledged: true, resolved_at: null }]);
    const audit = async () => (await database.query(`SELECT admin_id, action_type, target_type, target_id, details, reason
      FROM admin_actions`)).rows;
    expect(await audit()).toEqual([{
      admin_id: adminUser, action_type: 'marketplace_alert_acknowledged', target_type: 'booking', target_id: bookingId,
      details: { alertId, kind: 'request_waiting_amber', round: 1 }, reason: 'Calling the two nearest pros now.',
    }]);

    const again = await http.post(`/alerts/${alertId}/acknowledge`, {});
    expect(again.status).toBe(409);
    expect(await audit()).toHaveLength(1);
  });
}, 90000);
