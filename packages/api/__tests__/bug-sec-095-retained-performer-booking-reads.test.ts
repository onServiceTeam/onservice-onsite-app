import { withStaffReadDatabase, staffReadHttp, bookingB } from './helpers/staff-evidence-postgres';
import { bookingIntegrationIt as it, providerA } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug SEC-095 - a team member still recorded as the performer on a booking of no or another provider cannot read it or link a support case to it', async () => {
  // Booking B keeps provider B's approved team member as its performer, but
  // the booking itself has no provider, then belongs to provider A.
  for (const providerOnB of [null, providerA]) {
    await withStaffReadDatabase(async (database, { staffUserId }) => {
      await database.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerOnB]);
      const http = staffReadHttp(staffUserId, 'provider_staff');

      // Before SEC-095 the booking detail answered 200 with the customer's
      // name and address, the photo and change-order lists answered 200, and
      // a support case was created and linked to the booking.
      const detail = await http.detail(bookingB);
      const photos = await http.photoList(bookingB);
      const changeOrders = await http.changeOrders(bookingB);
      const proof = await http.proofSummary(bookingB);
      const supportCase = await http.openCase(bookingB);

      expect([detail.status, photos.status, changeOrders.status, proof.status, supportCase.status])
        .toEqual([404, 403, 403, 403, 404]);
      expect(supportCase.body.error.message).toBe('Booking not found for this account.');
      // (The fixture already holds customer B's own case on booking B.)
      expect((await database.query('SELECT COUNT(*)::int AS n FROM support_tickets WHERE user_id=$1', [staffUserId])).rows)
        .toEqual([{ n: 0 }]);
    });
  }
}, 90000);
