// HA-M3-93 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md 4.1; review finding on the M3-API build): each lost
// opportunity says who closed it. The customer and provider come from the
// status; a cancelled_by_admin request is 'admin' only when the
// booking_cancelled admin_actions row an admin cancellation writes exists,
// and otherwise 'system' (the 72-hour expiry writes the same status with no
// admin row). Four requests with no quote, one closed each way. Real HTTP on
// the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it, operatorId } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import {
  adminUser, closeAsExpired, closeByCustomer, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-93: a lost request is closed by admin only when an admin cancellation is on record', async () => {
  await withMarketplaceDatabase(async database => {
    const byAdmin = await insertQuoteRequest(database, { createdAgo: '3 hours' });
    await database.query(`UPDATE bookings SET status = 'cancelled_by_admin', cancelled_at = NOW(),
        cancellation_reason = 'Customer asked support to cancel', updated_at = NOW() WHERE id = $1`, [byAdmin]);
    await database.query(`INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
      VALUES ($1, 'booking_cancelled', 'booking', $2, '{}'::jsonb, 'Customer asked support to cancel')`, [operatorId, byAdmin]);
    const bySystem = await insertQuoteRequest(database, { createdAgo: '3 hours' });
    await closeAsExpired(database, bySystem);
    const byCustomer = await insertQuoteRequest(database, { createdAgo: '3 hours' });
    await closeByCustomer(database, byCustomer);
    const byProvider = await insertQuoteRequest(database, { createdAgo: '3 hours' });
    await database.query(`UPDATE bookings SET status = 'cancelled_by_provider', cancelled_at = NOW(), updated_at = NOW()
      WHERE id = $1`, [byProvider]);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/lost-opportunities');

    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.body.data.map((row: { bookingId: string; closedBy: string }) =>
      [row.bookingId, row.closedBy]))).toEqual({
      [byAdmin]: 'admin',
      [bySystem]: 'system',
      [byCustomer]: 'customer',
      [byProvider]: 'provider',
    });
  });
}, 90000);
