// HA-M2-347 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B; a W3-B overflow number, added by the review fix after
// 337-345 ran out): a photo sent in the booked thread at the same moment
// support posts a message to the booking must not deadlock. The support
// message locks the booking FOR UPDATE and then the booked thread (INSERT ...
// ON CONFLICT DO UPDATE); attaching the upload writes job_media.booking_id,
// whose foreign-key check takes a key-share lock on the booking. A send that
// locked the thread first and the booking second would cross that order and
// PostgreSQL would abort one side with a 500. The send now takes the
// booking's key share before the thread lock, so the two queue instead.
//
// The test pins the exact interleaving: a held job_media row lock pauses the
// send inside its attach (after its thread lock), the real support-message
// route starts and blocks, and only then is the media row released. Both
// must succeed and both messages land in the booked thread. Booking B starts
// paid and assigned to provider B with provider B's booked thread
// (helpers/reassign-postgres.ts). Real routes, auth, job-media service and
// migrations 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, bookingB, customerB, operatorId,
} from './helpers/booking-participant-postgres';
import { bookingBConversation, withReassignDatabase } from './helpers/reassign-postgres';
import { adminHttp, threadHttp } from './helpers/request-thread-postgres';
import {
  holdRowLock, mediaState, uploadThreadPhoto, waitForLockWaiters, withThreadMediaEnvironment,
} from './helpers/thread-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-347: a photo sent while support messages the booking does not deadlock either one', async () => {
  await withThreadMediaEnvironment(async () => {
    await withReassignDatabase(async database => {
      const photoId = await uploadThreadPhoto(customerB, 'customer', bookingBConversation);
      const mediaRow = await holdRowLock(database, 'SELECT id FROM job_media WHERE id = $1 FOR UPDATE', photoId);
      try {
        const sending = threadHttp(customerB, 'customer')
          .send(bookingBConversation, { messageType: 'image', mediaId: photoId, content: 'The leak is under the sink' })
          .then(response => response);
        await waitForLockWaiters(database, 1); // the send, paused inside its attach
        const supporting = adminHttp()
          .post(`/bookings/${bookingB}/message`, { message: 'onService support will call you both today.' })
          .then(response => response);
        await waitForLockWaiters(database, 2); // the support message, blocked behind the send
        await mediaRow.release();

        const [sent, supported] = await Promise.all([sending, supporting]);

        expect(sent.status).toBe(201);
        expect(supported.status).toBe(200);
      } finally {
        await mediaRow.release();
      }
      expect((await database.query(`SELECT conversation_id, sender_id, message_type, media_id FROM messages
          WHERE sender_id = ANY($1::uuid[]) ORDER BY created_at, id`, [[customerB, operatorId]])).rows).toEqual([
        { conversation_id: bookingBConversation, sender_id: customerB, message_type: 'image', media_id: photoId },
        { conversation_id: bookingBConversation, sender_id: operatorId, message_type: 'system', media_id: null },
      ]);
      expect(await mediaState(database, photoId)).toEqual({ status: 'attached', booking_id: bookingB });
    });
  });
}, 90000);
