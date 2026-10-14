// HA-M3-18 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 83): a request the back office cancelled itself raises
// no request_unfilled alert. Both requests below closed as cancelled_by_admin
// with no quote; only one has the booking_cancelled admin_actions row that an
// admin cancellation writes (booking-admin.service cancelBookingAsAdmin), and
// only the other, closed by the expiry, is alerted. Real SQL on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it, operatorId } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { alertsOf, closeAsExpired, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-18: no unfilled alert when an admin cancelled the request', async () => {
  await withMarketplaceDatabase(async database => {
    const adminCancelled = await insertQuoteRequest(database, { createdAgo: '73 hours', roundOpenedAgo: '73 hours' });
    await database.query(`UPDATE bookings SET status = 'cancelled_by_admin', cancelled_at = NOW(),
        cancellation_reason = 'Customer asked support to cancel', updated_at = NOW() WHERE id = $1`, [adminCancelled]);
    await database.query(`INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
      VALUES ($1, 'booking_cancelled', 'booking', $2, '{}'::jsonb, 'Customer asked support to cancel')`,
    [operatorId, adminCancelled]);
    const expired = await insertQuoteRequest(database, { createdAgo: '73 hours', roundOpenedAgo: '73 hours' });
    await closeAsExpired(database, expired);

    await sweepMarketplaceAlerts();

    expect(await alertsOf(database, adminCancelled)).toEqual([]);
    expect((await alertsOf(database, expired)).map(alert => alert.kind)).toEqual(['request_unfilled']);
  });
}, 90000);
