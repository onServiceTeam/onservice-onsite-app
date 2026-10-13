// HA-M2-147 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// merged.md P4 test 147): a voice note longer than its limit cannot be sent.
// The upload path already refuses an over-limit recording, so the stored
// length is raised past the limit the upload was taken under (60 s plus the
// 1 s tolerance), as a row written by an older build or a looser setting
// would be. Sending it gets 422 VOICE_TOO_LONG, no message is stored and the
// upload stays unattached. Real routes, auth, job-media service and
// migrations 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
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

it('HA-M2-147: an over-limit voice note gets 422 VOICE_TOO_LONG and stores nothing', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const voiceId = await uploadThreadVoice(customerA, 'customer', threadA);
    const limit = (await database.query<{ limit_duration_ms: number }>(
      `UPDATE job_media SET duration_ms = limit_duration_ms + 1001 WHERE id = $1 RETURNING limit_duration_ms`,
      [voiceId],
    )).rows[0]!.limit_duration_ms;
    expect(limit).toBe(60_000);
    const messagesBefore = (await database.query('SELECT id FROM messages ORDER BY id')).rows;

    const refused = await threadHttp(customerA, 'customer').send(threadA, { messageType: 'voice', mediaId: voiceId });

    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('VOICE_TOO_LONG');
    expect((await database.query('SELECT id FROM messages ORDER BY id')).rows).toEqual(messagesBefore);
    expect(await mediaState(database, voiceId)).toEqual({ status: 'stored', booking_id: null });
  });
}, 90000);
