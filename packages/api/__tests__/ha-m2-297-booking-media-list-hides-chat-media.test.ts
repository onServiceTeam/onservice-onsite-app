// HA-M2-297 (customer human audit 2026-10-13, D38 Milestone 2, package P3,
// critique M7): a photo sent in provider A's request thread carries the
// booking id once attached, but the booking media list
// (GET /api/v1/job-media/booking/:id) returns only the request's own media
// to every non-admin viewer: the sibling provider B (live quote, so allowed
// to see request media) and the customer both get the request photo and not
// the chat photo. Admin sees both, each labelled with its purpose. Real
// router, auth, service and migrations on the guarded PostgreSQL fixture.
import { db } from '../src/models/db';
import { attachChatMediaInTransaction } from '../src/services/job-media.service';
import {
  bookingIntegrationIt as it, customerA, providerA, providerB, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  adminUser, attachRequestMedia, createConversation, createQuoteRequest, mediaHttp, submitQuote, syntheticJpeg,
  uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-297: the booking media list hides chat media from a sibling provider', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const bookingId = await createQuoteRequest(database);
    const requestPhoto = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    await attachRequestMedia(customerA, bookingId, [requestPhoto.id]);
    await submitQuote(database, bookingId, providerA);
    await submitQuote(database, bookingId, providerB);
    const conversationId = await createConversation(database, bookingId, customerA, providerUserA);
    const chat = await uploadThroughApi(mediaHttp(providerUserA, 'provider'), {
      purpose: 'chat', conversationId, kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 640 }),
    });
    await db.transaction(client => attachChatMediaInTransaction(client, {
      mediaId: chat.id, conversationId, senderId: providerUserA, expectedKind: 'photo',
    }));
    const listed = async (userId: string, role: string) => {
      const response = await mediaHttp(userId, role).booking(bookingId);
      expect(response.status).toBe(200);
      return response.body.data.items as Array<{ id: string; purpose: string; url: string }>;
    };

    const siblingItems = await listed(providerUserB, 'provider');
    expect(siblingItems.map(item => item.id)).toEqual([requestPhoto.id]);
    expect(siblingItems[0]!.purpose).toBe('job_request');
    expect((await listed(customerA, 'customer')).map(item => item.id)).toEqual([requestPhoto.id]);
    expect((await listed(providerUserA, 'provider')).map(item => item.id)).toEqual([requestPhoto.id]);

    const adminItems = await listed(adminUser, 'admin');
    expect(adminItems.map(item => [item.id, item.purpose]).sort()).toEqual(
      [[requestPhoto.id, 'job_request'], [chat.id, 'chat']].sort(),
    );
  });
}, 60000);
