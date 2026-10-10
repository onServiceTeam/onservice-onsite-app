import { withStaffReadDatabase, staffReadHttp, adminCaseHttp, bookingA, bookingB } from './helpers/staff-evidence-postgres';
import {
  bookingIntegrationIt as it, customerA, customerB, operatorId, providerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S1-11 supporting checks (SEC-095 is the bug test). Booking A belongs to
// provider B and records provider B's approved team member as its performer.

async function casesBy(database: Parameters<Parameters<typeof withStaffReadDatabase>[0]>[0], userId: string) {
  return (await database.query('SELECT booking_id FROM support_tickets WHERE user_id=$1', [userId])).rows;
}

it('the approved team member of the booking\'s own provider still reads their job and links a support case to it', async () => {
  await withStaffReadDatabase(async (database, { staffUserId }) => {
    const http = staffReadHttp(staffUserId, 'provider_staff');

    const detail = await http.detail(bookingA);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).toContain('Synthetic address A');
    const photos = await http.photoList(bookingA);
    expect(photos.status).toBe(200);
    // Exactly booking A's own photo, not booking B's.
    expect(photos.body.data.map((p: { bookingId: string }) => p.bookingId)).toEqual([bookingA]);
    expect((await http.changeOrders(bookingA)).status).toBe(200);
    expect((await http.openCase(bookingA)).status).toBe(201);
    expect(await casesBy(database, staffUserId)).toEqual([{ booking_id: bookingA }]);
  });
}, 60000);

it('on a booking the owner performs (no team member recorded), the owner and the customer still read it', async () => {
  await withStaffReadDatabase(async database => {
    await database.query('UPDATE bookings SET performer_staff_id=NULL WHERE id=$1', [bookingA]);

    for (const [userId, role] of [[providerUserB, 'provider'], [customerA, 'customer']] as const) {
      const http = staffReadHttp(userId, role);
      expect((await http.detail(bookingA)).status).toBe(200);
      expect((await http.photoList(bookingA)).status).toBe(200);
      expect((await http.changeOrders(bookingA)).status).toBe(200);
    }
    // (The fixture already holds one case of customer A on booking A.)
    const casesBefore = await casesBy(database, customerA);
    expect((await staffReadHttp(customerA, 'customer').openCase(bookingA)).status).toBe(201);
    expect(await casesBy(database, customerA)).toEqual([...casesBefore, { booking_id: bookingA }]);
  });
}, 60000);

it('on a booking still recording another provider\'s team member, its current owner and customer still read it', async () => {
  await withStaffReadDatabase(async database => {
    await database.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerA]);

    for (const [userId, role] of [[providerUserA, 'provider'], [customerB, 'customer']] as const) {
      const http = staffReadHttp(userId, role);
      expect((await http.detail(bookingB)).status).toBe(200);
      expect((await http.photoList(bookingB)).status).toBe(200);
      expect((await http.changeOrders(bookingB)).status).toBe(200);
    }
    expect((await staffReadHttp(providerUserA, 'provider').openCase(bookingB)).status).toBe(201);
    expect(await casesBy(database, providerUserA)).toEqual([{ booking_id: bookingB }]);
  });
}, 60000);

it('a non-approved team member of the right provider still cannot read the job', async () => {
  await withStaffReadDatabase(async (database, { staffUserId, staffId }) => {
    await database.query("UPDATE provider_staff SET status='suspended' WHERE id=$1", [staffId]);
    const http = staffReadHttp(staffUserId, 'provider_staff');

    expect((await http.detail(bookingA)).status).toBe(404);
    expect((await http.photoList(bookingA)).status).toBe(403);
    expect((await http.changeOrders(bookingA)).status).toBe(403);
  });
}, 60000);

it('an admin can still open a case on behalf of a suspended team member, linked to a job of their own provider', async () => {
  await withStaffReadDatabase(async (database, { staffUserId, staffId }) => {
    await database.query("UPDATE provider_staff SET status='suspended' WHERE id=$1", [staffId]);

    const response = await adminCaseHttp()(staffUserId, bookingA);

    expect(response.status).toBe(201);
    expect(await casesBy(database, staffUserId)).toEqual([{ booking_id: bookingA }]);
    // The admin who linked it is on record.
    const ticketId = (await database.query<{ id: string }>('SELECT id FROM support_tickets WHERE user_id=$1', [staffUserId]))
      .rows[0]!.id;
    expect((await database.query(`SELECT admin_id, target_type, target_id, details->>'forUserId' AS for_user,
        details->>'bookingId' AS booking FROM admin_actions WHERE action_type='config_changed'`)).rows).toEqual([{
      admin_id: operatorId, target_type: 'support_ticket', target_id: ticketId, for_user: staffUserId, booking: bookingA,
    }]);
  });
}, 60000);

it('an admin cannot link a case of a team member to a booking of no or another provider that still records them', async () => {
  for (const providerOnB of [null, providerA]) {
    await withStaffReadDatabase(async (database, { staffUserId }) => {
      await database.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerOnB]);

      const response = await adminCaseHttp()(staffUserId, bookingB);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Booking not found for this account.');
      expect(await casesBy(database, staffUserId)).toEqual([]);
    });
  }
}, 90000);
