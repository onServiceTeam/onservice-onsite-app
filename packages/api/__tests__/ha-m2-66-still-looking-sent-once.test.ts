// HA-M2-66 (customer human audit 2026-10-13, D38 Milestone 2, package P2): a
// request with no quote request_customer_still_looking_minutes (30) after it
// was sent gets one "still looking" notice, and only one: the worker claims
// the request with a conditional UPDATE, so a second run sends nothing. The
// scheduler's own processor runs the step (only BullMQ's Redis connection is
// replaced) over real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, notificationsOf, customerA,
} from './helpers/request-flow-postgres';

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

it('HA-M2-66: the still-looking notice is sent exactly once', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { createdAgo: '40 minutes', roundOpenedAgo: '40 minutes' });
    await insertQuoteRequest(database, { createdAgo: '10 minutes', roundOpenedAgo: '10 minutes' });

    const first = await mockSchedulerProcessor!({ name: 'request-still-looking' });
    const second = await mockSchedulerProcessor!({ name: 'request-still-looking' });

    expect(first).toEqual({ stillLooking: 1 });
    expect(second).toEqual({ stillLooking: 0 });
    const notices = (await notificationsOf(database, customerA)).filter(n => n.type === 'request_still_looking');
    expect(notices.map(n => [n.body, n.data.bookingId])).toEqual([
      ['We\'re still looking for a pro for your request.', bookingId],
    ]);
    expect((await database.query(`SELECT request_still_looking_notified_at IS NOT NULL AS claimed
      FROM bookings WHERE id = $1`, [bookingId])).rows[0].claimed).toBe(true);
  });
}, 90000);
