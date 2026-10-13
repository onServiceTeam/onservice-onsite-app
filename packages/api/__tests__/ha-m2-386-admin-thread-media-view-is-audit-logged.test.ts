// HA-M2-386 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): an admin who opens a
// request thread's photo through the job-media routes leaves an audit
// record. Minting a link to a sent thread photo (GET /:id/url) writes an
// admin_actions row job_media_viewed against the booking with
// {mediaIds, purpose: 'chat', conversationId}; the booking listing
// (GET /booking/:id), which shows admins the thread media too, writes one row
// for the request media (unchanged: {mediaIds}) and one for each
// conversation's media. Private thread media is personal data, as request
// media is (design-media.md section 3: each admin URL mint writes a row).
// Real router, auth, service and migrations 006/123/138/183/184 on the
// guarded PostgreSQL fixture.
import { db } from '../src/models/db';
import { attachChatMediaInTransaction } from '../src/services/job-media.service';
import {
  bookingIntegrationIt as it, customerA, providerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  adminUser, attachRequestMedia, createConversation, createQuoteRequest, mediaHttp, submitQuote, syntheticJpeg,
  uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-386: an admin link to thread media writes a job_media_viewed row naming the conversation', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const bookingId = await createQuoteRequest(database);
    const requestPhoto = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    await attachRequestMedia(customerA, bookingId, [requestPhoto.id]);
    await submitQuote(database, bookingId, providerA);
    const conversationId = await createConversation(database, bookingId, customerA, providerUserA);
    const chat = await uploadThroughApi(mediaHttp(providerUserA, 'provider'), {
      purpose: 'chat', conversationId, kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 640 }),
    });
    await db.transaction(client => attachChatMediaInTransaction(client, {
      mediaId: chat.id, conversationId, senderId: providerUserA, expectedKind: 'photo',
    }));
    const audits = async () => (await database.query(
      `SELECT admin_id, action_type, target_type, target_id, details FROM admin_actions
        WHERE action_type = 'job_media_viewed' ORDER BY created_at, id`,
    )).rows;

    const admin = mediaHttp(adminUser, 'admin');
    expect((await admin.url(chat.id)).status).toBe(200);
    const chatRow = {
      admin_id: adminUser, action_type: 'job_media_viewed', target_type: 'booking', target_id: bookingId,
      details: { mediaIds: [chat.id], purpose: 'chat', conversationId },
    };
    expect(await audits()).toEqual([chatRow]);

    const listing = await admin.booking(bookingId);
    expect(listing.status).toBe(200);
    expect(listing.body.data.items.map((item: { id: string }) => item.id).sort()).toEqual([requestPhoto.id, chat.id].sort());
    const rows = await audits();
    expect(rows).toHaveLength(3);
    expect(rows.slice(1)).toEqual(expect.arrayContaining([
      { ...chatRow },
      {
        admin_id: adminUser, action_type: 'job_media_viewed', target_type: 'booking', target_id: bookingId,
        details: { mediaIds: [requestPhoto.id] },
      },
    ]));
  });
}, 60000);
