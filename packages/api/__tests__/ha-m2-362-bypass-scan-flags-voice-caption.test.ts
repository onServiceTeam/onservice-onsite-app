// HA-M2-362 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I3;
// W3-A fix-round overflow number for a review finding): the weekly
// off-platform bypass scan reads voice-note captions too. A voice message in
// a request thread keeps its caption in `content` (the send route accepts up
// to 2000 characters with any message type), so "pay me by GCash" typed
// under a voice note must be flagged like the same words under a photo
// (HA-M2-77). A voice note whose caption names GCash is flagged; a voice note
// with a harmless caption in the same thread is not. The scheduler's own
// processor runs the 'bypass-detect' job over real rows on the guarded
// PostgreSQL fixture with the real migrations 006, 123, 138, 184 and 185
// (each voice message points at a stored chat recording, as migration 185
// requires).
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { insertStoredMedia } from './helpers/request-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

type SchedulerProcessor = (job: { name: string }) => Promise<Record<string, unknown>>;
let mockSchedulerProcessor: SchedulerProcessor | undefined;
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(), getRepeatableJobs: jest.fn().mockResolvedValue([]), removeRepeatableByKey: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation((_name: string, processor: SchedulerProcessor) => {
    mockSchedulerProcessor = processor;
    return { on: jest.fn() };
  }),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import '../src/jobs/workers';

it('HA-M2-362: the bypass scan flags a phrase in a voice-note caption', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const conversationId = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const voiceMessage = async (caption: string) => {
      const recording = await insertStoredMedia(database, customerA, { kind: 'voice', purpose: 'chat', conversationId });
      return (await database.query<{ id: string }>(`INSERT INTO messages
          (conversation_id, sender_id, content, message_type, media_id, media_duration_ms, created_at)
        VALUES ($1, $2, $3, 'voice', $4, 8000, clock_timestamp()) RETURNING id`,
      [conversationId, customerA, caption, recording])).rows[0]!.id;
    };
    const offPlatform = await voiceMessage('Listen to the noise. Pay me by gcash instead, cheaper for both of us.');
    const harmless = await voiceMessage('Listen to the rattling noise the unit makes at night.');

    expect(await mockSchedulerProcessor!({ name: 'bypass-detect' })).toEqual({ bypasses: 1 });

    const flags = (await database.query(`SELECT id, is_flagged FROM messages WHERE id = ANY($1::uuid[])`,
      [[offPlatform, harmless]])).rows;
    expect(flags.find(row => row.id === offPlatform)).toEqual({ id: offPlatform, is_flagged: true });
    expect(flags.find(row => row.id === harmless)).toEqual({ id: harmless, is_flagged: false });
  });
}, 90000);
