// HA-M2-104 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 29): when an admin mints a link to request media (one item,
// or the booking listing) an admin_actions row job_media_viewed is written
// against the booking with the media ids, before the link is returned. The
// customer viewing their own media writes nothing. Real router, auth,
// service and migrations 183/184 (the action-name splice) on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it, customerA, operatorId } from './helpers/booking-participant-postgres';
import {
  adminUser, attachRequestMedia, createQuoteRequest, mediaHttp, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-104: an admin URL mint writes an admin_actions row job_media_viewed', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const first = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const second = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 900 }) });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [first.id, second.id]);
    const audits = async () => (await database.query(
      `SELECT admin_id, action_type, target_type, target_id, details FROM admin_actions
        WHERE action_type = 'job_media_viewed' ORDER BY created_at, id`,
    )).rows;

    expect((await customer.url(first.id)).status).toBe(200);
    expect(await audits()).toEqual([]);

    const admin = mediaHttp(adminUser, 'admin');
    expect((await admin.url(first.id)).status).toBe(200);
    expect(await audits()).toEqual([
      { admin_id: adminUser, action_type: 'job_media_viewed', target_type: 'booking', target_id: bookingId, details: { mediaIds: [first.id] } },
    ]);

    const listing = await mediaHttp(operatorId, 'super_admin').booking(bookingId);
    expect(listing.status).toBe(200);
    expect(listing.body.data.items).toHaveLength(2);
    const rows = await audits();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ admin_id: operatorId, target_id: bookingId });
    expect([...rows[1].details.mediaIds].sort()).toEqual([first.id, second.id].sort());
  });
}, 60000);
