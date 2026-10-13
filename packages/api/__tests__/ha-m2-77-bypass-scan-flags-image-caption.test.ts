// HA-M2-77 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I3): the
// weekly off-platform bypass scan now reads photo captions too. In a request
// thread a photo message keeps its caption in `content`; before this change
// the scan read text messages only, so "pay me by GCash" written under a
// photo was never flagged. A photo whose caption names GCash is flagged; a
// photo with a harmless caption in the same thread is not. The scheduler's
// own processor runs the 'bypass-detect' job over real rows on the guarded
// PostgreSQL fixture with the real migrations 006, 123, 138, 184 and 185.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
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

it('HA-M2-77: the bypass scan flags a phrase in an image caption', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const conversationId = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const photoMessage = async (caption: string) => (await database.query<{ id: string }>(`INSERT INTO messages
        (conversation_id, sender_id, content, message_type, created_at)
      VALUES ($1, $2, $3, 'image', clock_timestamp()) RETURNING id`, [conversationId, customerA, caption])).rows[0]!.id;
    const offPlatform = await photoMessage('This is the unit. Pay me by gcash instead, cheaper for both of us.');
    const harmless = await photoMessage('This is the unit that leaks water near the window.');

    expect(await mockSchedulerProcessor!({ name: 'bypass-detect' })).toEqual({ bypasses: 1 });

    const flags = (await database.query(`SELECT id, is_flagged FROM messages WHERE id = ANY($1::uuid[])`,
      [[offPlatform, harmless]])).rows;
    expect(flags.find(row => row.id === offPlatform)).toEqual({ id: offPlatform, is_flagged: true });
    expect(flags.find(row => row.id === harmless)).toEqual({ id: harmless, is_flagged: false });
  });
}, 90000);
