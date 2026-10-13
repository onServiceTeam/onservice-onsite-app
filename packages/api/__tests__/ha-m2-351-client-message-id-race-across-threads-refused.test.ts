// HA-M2-351 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B; a W3-B overflow number, added by the review fix after
// 337-345 ran out): an app that reuses one clientMessageId for two sends in
// two different threads at the same moment must not end up with a photo
// attached to a message that does not exist. The customer has a thread with
// provider A and one with provider B. Send 1 (text, thread A) and send 2
// (photo, thread B) carry the same clientMessageId. Neither sees the other in
// its duplicate check, because send 1 has not committed yet; send 2's INSERT
// then waits on send 1's key in the unique index and, once send 1 commits,
// inserts nothing. Send 2 must answer 409 CLIENT_MESSAGE_ID_REUSED and roll
// back its attach, rather than return thread A's message as a "duplicate"
// and commit the photo as attached with no message pointing at it.
//
// The interleaving is pinned: a held lock on the customer's users row pauses
// send 1 at the end of its INSERT (the sender foreign-key check), after its
// key is in the index; send 2 then starts and waits on that key; only then is
// the users row released. The real send path (messaging.service
// sendParticipantMessage, used by HTTP and socket alike), the real job-media
// attach and migrations 006/123/138/183/184/185 on the guarded PostgreSQL
// fixture.
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, quoteFromB, requestBooking, seedQuoteRequest,
} from './helpers/request-thread-postgres';
import {
  holdRowLock, mediaState, uploadThreadPhoto, waitForLockWaiters, withThreadMediaDatabase,
} from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';
import { sendParticipantMessage } from '../src/services/messaging.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

type Outcome = { ok: Awaited<ReturnType<typeof sendParticipantMessage>> } | { error: unknown };

function settle(promise: ReturnType<typeof sendParticipantMessage>): Promise<Outcome> {
  return promise.then(ok => ({ ok }), error => ({ error }));
}

it('HA-M2-351: a clientMessageId reused in another thread at the same moment gets 409 and leaves the photo unattached', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    const photoId = await uploadThreadPhoto(customerA, 'customer', threadB);
    const clientMessageId = '87000000-0000-4000-8000-000000000351';

    const senderRow = await holdRowLock(database, 'SELECT id FROM users WHERE id = $1 FOR UPDATE', customerA);
    let outcomes: [Outcome, Outcome];
    try {
      const first = settle(sendParticipantMessage({
        conversationId: threadA, senderId: customerA, content: 'Is Tuesday morning fine?', clientMessageId,
      }));
      await waitForLockWaiters(database, 1); // send 1, its key in the index, paused before commit
      const second = settle(sendParticipantMessage({
        conversationId: threadB, senderId: customerA, messageType: 'image', mediaId: photoId,
        content: 'The water stain', clientMessageId,
      }));
      await waitForLockWaiters(database, 2); // send 2, waiting on send 1's key
      await senderRow.release();
      outcomes = await Promise.all([first, second]);
    } finally {
      await senderRow.release();
    }

    const [first, second] = outcomes;
    expect('ok' in first && first.ok.duplicate).toBe(false);
    expect('error' in second ? second.error : second.ok).toMatchObject({
      statusCode: 409, code: 'CLIENT_MESSAGE_ID_REUSED',
    });
    expect((await database.query(`SELECT conversation_id, message_type, media_id FROM messages
        WHERE client_message_id = $1`, [clientMessageId])).rows).toEqual([
      { conversation_id: threadA, message_type: 'text', media_id: null },
    ]);
    expect(await mediaState(database, photoId)).toEqual({ status: 'stored', booking_id: null });
  });
}, 90000);
