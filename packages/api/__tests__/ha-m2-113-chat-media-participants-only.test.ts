// HA-M2-113 (customer human audit 2026-10-13, D38 Milestone 2, package P3,
// merged.md P3 test 113): a photo sent in a request thread is viewable by
// both participants of that conversation (the provider who sent it and the
// customer) once it is attached to the message, and is 404 for a sibling
// provider who can see the request's own media (live quote on the same
// request) and for another customer. Before it is attached only its uploader
// can see it. Real router, auth, service (attachChatMediaInTransaction, the
// export request threads use) and migrations 006/123/138/183/184 on the
// guarded PostgreSQL fixture.
import { db } from '../src/models/db';
import { attachChatMediaInTransaction } from '../src/services/job-media.service';
import {
  bookingIntegrationIt as it, customerA, customerB, providerA, providerB, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createConversation, createQuoteRequest, mediaHttp, submitQuote, syntheticJpeg,
  uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-113: chat media is viewable by both participants and 404 for a sibling provider', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const bookingId = await createQuoteRequest(database);
    const requestPhoto = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    await attachRequestMedia(customerA, bookingId, [requestPhoto.id]);
    await submitQuote(database, bookingId, providerA);
    await submitQuote(database, bookingId, providerB);
    const conversationId = await createConversation(database, bookingId, customerA, providerUserA);

    const providerAHttp = mediaHttp(providerUserA, 'provider');
    const sibling = mediaHttp(providerUserB, 'provider');
    const chat = await uploadThroughApi(providerAHttp, {
      purpose: 'chat', conversationId, kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 777 }),
    });
    expect(chat.completed.status).toBe(200);
    expect((await customer.url(chat.id)).status).toBe(404); // not sent yet
    expect((await providerAHttp.url(chat.id)).status).toBe(200); // its uploader

    const attached = await db.transaction(client => attachChatMediaInTransaction(client, {
      mediaId: chat.id, conversationId, senderId: providerUserA, expectedKind: 'photo',
    }));
    expect(attached).toEqual({ kind: 'photo', durationMs: null });
    expect((await database.query('SELECT status, booking_id FROM job_media WHERE id = $1', [chat.id])).rows)
      .toEqual([{ status: 'attached', booking_id: bookingId }]);

    expect((await customer.url(chat.id)).status).toBe(200);
    expect((await providerAHttp.url(chat.id)).status).toBe(200);
    // The sibling provider may see the request's photo but not A's thread.
    expect((await sibling.url(requestPhoto.id)).status).toBe(200);
    expect((await sibling.url(chat.id)).status).toBe(404);
    expect((await mediaHttp(customerB, 'customer').url(chat.id)).status).toBe(404);
  });
}, 60000);
