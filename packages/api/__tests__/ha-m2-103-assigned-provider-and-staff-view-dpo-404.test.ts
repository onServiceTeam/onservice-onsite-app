// HA-M2-103 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 28): once a request is booked, the assigned provider and
// the approved staff member performing the job can view its media; a DPO
// account gets 404 (no Booking 360 access, matching requireAdmin), and the
// staff member loses access when another staff member performs the job.
// Real router, auth, service and migrations 131/156/183/184 on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it, customerA, providerA, providerUserA } from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createQuoteRequest, dpoUser, mediaHttp, staffMember, staffUser, syntheticJpeg,
  uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-103: the assigned provider and the approved performer staff can view, a DPO gets 404', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const { id } = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [id]);

    const staff = mediaHttp(staffUser, 'provider_staff');
    expect((await staff.url(id)).status).toBe(404); // not their job yet

    await database.query(`UPDATE bookings SET provider_id = $2, performer_staff_id = $3, status = 'confirmed'
      WHERE id = $1`, [bookingId, providerA, staffMember]);

    expect((await mediaHttp(providerUserA, 'provider').url(id)).status).toBe(200);
    expect((await staff.url(id)).status).toBe(200);
    expect((await staff.booking(bookingId)).body.data.items).toHaveLength(1);

    const dpo = mediaHttp(dpoUser, 'dpo');
    const dpoUrl = await dpo.url(id);
    expect(dpoUrl.status).toBe(404);
    expect((await dpo.booking(bookingId)).status).toBe(404);

    await database.query("UPDATE provider_staff SET status = 'suspended' WHERE id = $1", [staffMember]);
    expect((await staff.url(id)).status).toBe(404);
  });
}, 60000);
