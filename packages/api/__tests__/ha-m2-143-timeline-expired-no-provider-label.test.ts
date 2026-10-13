// HA-M2-143 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// the admin booking timeline shows a quote request that no pro answered in
// time (cancelled with the code expired_no_provider) as "Expired: no pro
// responded in time." instead of the raw code. Other reasons are shown as
// written. Real admin route GET /api/v1/admin/bookings/:id/timeline on the
// guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, bookingA,
} from './helpers/booking-participant-postgres';
import {
  addBookingAdminReadShapes, adminHttp, requestBooking, seedQuoteRequest, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-143: the admin timeline shows the expired_no_provider label', async () => {
  await withRequestThreadDatabase(async database => {
    await addBookingAdminReadShapes(database);
    await seedQuoteRequest(database, 'requested');
    await database.query(`DELETE FROM booking_quotes WHERE booking_id = $1`, [requestBooking]);
    await database.query(`UPDATE bookings SET status = 'cancelled_by_admin', cancelled_at = NOW(),
        cancellation_reason = 'expired_no_provider' WHERE id = $1`, [requestBooking]);
    await database.query(`UPDATE bookings SET status = 'cancelled_by_customer', cancelled_at = NOW(),
        cancellation_reason = 'Found someone else' WHERE id = $1`, [bookingA]);
    const admin = adminHttp();

    const expired = await admin.get(`/bookings/${requestBooking}/timeline`);
    const customerCancel = await admin.get(`/bookings/${bookingA}/timeline`);

    expect(expired.status).toBe(200);
    expect(expired.body.data.find((event: { type: string }) => event.type === 'booking_cancelled'))
      .toMatchObject({ description: 'Expired: no pro responded in time.' });
    expect(customerCancel.body.data.find((event: { type: string }) => event.type === 'booking_cancelled'))
      .toMatchObject({ description: 'Found someone else' });
  });
}, 90000);
