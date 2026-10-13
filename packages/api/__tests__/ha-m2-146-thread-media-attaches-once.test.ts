// HA-M2-146 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// merged.md P4 test 146): one upload makes one message. The customer sends a
// voice note in provider A's thread (201); sending the same mediaId again as
// a new message (a new clientMessageId) gets 422 MEDIA_INVALID, and the
// database holds exactly one message pointing at that upload. Real routes,
// auth, job-media service and migrations 006/123/138/183/184/185 on the
// guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { mediaState, uploadThreadVoice, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-146: the same media cannot be attached to a second message', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const voiceId = await uploadThreadVoice(customerA, 'customer', threadA);
    const customer = threadHttp(customerA, 'customer');

    const first = await customer.send(threadA, {
      messageType: 'voice', mediaId: voiceId, clientMessageId: '86000000-0000-4000-8000-000000000001',
    });
    const second = await customer.send(threadA, {
      messageType: 'voice', mediaId: voiceId, clientMessageId: '86000000-0000-4000-8000-000000000002',
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(422);
    expect(second.body.error.code).toBe('MEDIA_INVALID');
    expect((await database.query('SELECT id FROM messages WHERE media_id = $1', [voiceId])).rows)
      .toEqual([{ id: first.body.data.id }]);
    expect(await mediaState(database, voiceId)).toEqual({ status: 'attached', booking_id: requestBooking });
  });
}, 90000);
