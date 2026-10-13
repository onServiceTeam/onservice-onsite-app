// HA-M2-346 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B; a W3-B overflow number, added by the review fix after
// 337-345 ran out): a photo sent in the booked thread at the same moment
// support reassigns the booking must not deadlock. Attaching the upload
// writes job_media.booking_id, whose foreign-key check takes a key-share
// lock on the booking row; the reassignment locks the booking FOR UPDATE and
// then closes the old provider's thread. A send that locked the thread first
// and the booking second would cross that order, and PostgreSQL would abort
// one side (a 500 for the customer or for support). The send now takes the
// booking's key share before the thread lock, so the two queue instead.
//
// The test pins the exact interleaving: a held job_media row lock pauses the
// send inside its attach (after its thread lock), the real reassign route
// starts and blocks, and only then is the media row released. Both must
// succeed. Booking B starts paid and assigned to provider B with provider B's
// booked thread (helpers/reassign-postgres.ts); the time-overlap check is
// stubbed, as in the other reassign tests. Real routes, auth, job-media
// service and migrations 006/123/138/183/184/185 on the guarded PostgreSQL
// fixture.
import * as matchingService from '../src/services/matching.service';
import {
  bookingIntegrationIt as it, bookingB, customerB, providerA,
} from './helpers/booking-participant-postgres';
import { bookingBConversation, reassignHttp, withReassignDatabase } from './helpers/reassign-postgres';
import { threadHttp } from './helpers/request-thread-postgres';
import {
  holdRowLock, mediaState, uploadThreadPhoto, waitForLockWaiters, withThreadMediaEnvironment,
} from './helpers/thread-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-346: a photo sent while support reassigns the booking does not deadlock either one', async () => {
  await withThreadMediaEnvironment(async () => {
    await withReassignDatabase(async database => {
      const photoId = await uploadThreadPhoto(customerB, 'customer', bookingBConversation);
      const overlap = jest.spyOn(matchingService, 'hasBookingConflict').mockResolvedValue(false);
      const mediaRow = await holdRowLock(database, 'SELECT id FROM job_media WHERE id = $1 FOR UPDATE', photoId);
      try {
        const sending = threadHttp(customerB, 'customer')
          .send(bookingBConversation, { messageType: 'image', mediaId: photoId, content: 'The leak is under the sink' })
          .then(response => response);
        await waitForLockWaiters(database, 1); // the send, paused inside its attach
        const reassigning = reassignHttp()(bookingB, providerA).then(response => response);
        await waitForLockWaiters(database, 2); // the reassignment, blocked behind the send
        await mediaRow.release();

        const [sent, reassigned] = await Promise.all([sending, reassigning]);

        expect(sent.status).toBe(201);
        expect(reassigned.status).toBe(200);
      } finally {
        await mediaRow.release();
        overlap.mockRestore();
      }
      expect((await database.query(`SELECT conversation_id, message_type, media_id FROM messages
          WHERE sender_id = $1`, [customerB])).rows).toEqual([{
        conversation_id: bookingBConversation, message_type: 'image', media_id: photoId,
      }]);
      expect(await mediaState(database, photoId)).toEqual({ status: 'attached', booking_id: bookingB });
      expect((await database.query('SELECT state, state_reason FROM conversations WHERE id = $1',
        [bookingBConversation])).rows[0]).toEqual({ state: 'read_only', state_reason: 'provider_reassigned' });
    });
  });
}, 90000);
