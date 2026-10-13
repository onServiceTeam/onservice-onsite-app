// HA-M2-148 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// merged.md P4 test 148): an admin opening a request thread in
// Communications can play its voice note. GET /admin/conversations/:id
// returns the voice message with a signed link minted for the admin (and the
// stored length), the link serves the recording, and opening the thread still
// writes the conversation_viewed audit row against the booking. Minting the
// link also writes job_media_viewed (package P3), so the number of
// admin_actions rows is deliberately not pinned. Real admin routes, auth,
// job-media service and migrations 006/123/138/183/184/185 on the guarded
// PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, operatorId,
} from './helpers/booking-participant-postgres';
import {
  adminHttp, quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { fetchSigned } from './helpers/job-media-postgres';
import { uploadThreadVoice, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-148: the admin thread view returns the voice URL and logs conversation_viewed', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const voiceId = await uploadThreadVoice(customerA, 'customer', threadA, 9_000);
    const sent = await threadHttp(customerA, 'customer').send(threadA, { messageType: 'voice', mediaId: voiceId });
    expect(sent.status).toBe(201);

    const view = await adminHttp().get(`/conversations/${threadA}`);

    expect(view.status).toBe(200);
    const voice = (view.body.data.messages as Array<Record<string, any>>).find(message => message.id === sent.body.data.id);
    expect(voice).toMatchObject({
      messageType: 'voice', mediaId: voiceId, mediaDurationMs: 9_000,
      media: { id: voiceId, kind: 'voice', mime: 'audio/mp4', durationMs: 9_000 },
    });
    expect(voice!.media.url).toMatch(new RegExp(`^/api/v1/job-media/file/${voiceId}\\.${operatorId}\\.`));
    const served = await fetchSigned(voice!.media.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('audio/mp4');

    const viewed = (await database.query(`SELECT admin_id, target_type, target_id, details FROM admin_actions
        WHERE action_type = 'conversation_viewed'`)).rows;
    expect(viewed).toEqual([{
      admin_id: operatorId, target_type: 'booking', target_id: requestBooking, details: { conversationId: threadA },
    }]);
  });
}, 90000);
