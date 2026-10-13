// HA-M2-327 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I2;
// W3-A overflow number): when a live quote on an open request lapses, the
// expiry worker posts the provider's `quote_expired` system message ("This
// quote expired.") in that provider's request thread, which then reads
// read-only with reason quote_expired. The quote comes through the real route
// (which opens the thread); its stored deadline is then moved into the past
// and the scheduler's own processor runs 'expire-quotes' over the real rows.
// Guarded PostgreSQL fixture with the real migrations 183, 184 and 185.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, providerUserA,
} from './helpers/request-flow-postgres';
import { db } from '../src/models/db';
import { selectThreadsForBooking } from '../src/services/request-thread.service';

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

it('HA-M2-327: a lapsed quote posts quote_expired in its thread', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '10 minutes' });
    const quoteId = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id as string;
    await database.query(`UPDATE booking_quotes SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [quoteId]);

    expect(await mockSchedulerProcessor!({ name: 'expire-quotes' })).toEqual({ expired: 1 });

    const [thread] = await selectThreadsForBooking(db, bookingId);
    expect([thread!.provider_id, thread!.effective_state, thread!.effective_state_reason])
      .toEqual([providerUserA, 'read_only', 'quote_expired']);
    expect((await database.query(`SELECT sender_id, system_event, content FROM messages
      WHERE conversation_id = $1 ORDER BY created_at, id`, [thread!.id])).rows).toEqual([
      { sender_id: providerUserA, system_event: 'quote_sent', content: 'Sent a quote. Open the quote to see the price and time.' },
      { sender_id: providerUserA, system_event: 'quote_expired', content: 'This quote expired.' },
    ]);
  }, { through: 185 });
}, 90000);
