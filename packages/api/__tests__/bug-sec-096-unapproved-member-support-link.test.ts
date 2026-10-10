import { withStaffReadDatabase, staffReadHttp, bookingA } from './helpers/staff-evidence-postgres';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug SEC-096 - a team member who is no longer approved cannot link a new support case to their job', async () => {
  await withStaffReadDatabase(async (database, { staffUserId, staffId }) => {
    // Booking A is the team member's own provider's job, and they are still
    // recorded as its performer, but their membership was suspended.
    await database.query("UPDATE provider_staff SET status='suspended' WHERE id=$1", [staffId]);

    // Before SEC-096 the support-case link checked only that the caller was
    // the recorded performer, not that they were still approved: the case was
    // created and attached to the booking (every other job read already
    // required approval).
    const supportCase = await staffReadHttp(staffUserId, 'provider_staff').openCase(bookingA);

    expect(supportCase.status).toBe(404);
    expect(supportCase.body.error.message).toBe('Booking not found for this account.');
    expect((await database.query('SELECT COUNT(*)::int AS n FROM support_tickets WHERE user_id=$1', [staffUserId])).rows)
      .toEqual([{ n: 0 }]);
  });
}, 60000);
