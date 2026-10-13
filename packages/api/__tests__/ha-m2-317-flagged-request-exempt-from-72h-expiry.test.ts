// HA-M2-317 (customer human audit 2026-10-13, D38 Milestone 2; W3-A overflow
// number for an item the P2 build report left untested): a quote request the
// engine flagged for back-office review (request_ops_review_at, here
// 'max_rounds') is exempt from the 72-hour unmatched expiry (critique
// question 19 default), so the back office can still work on it. An
// unflagged request of the same age expires in the same run. The scheduler's
// own processor runs 'expire-unmatched' over real rows on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { withRequestFlowDatabase, insertQuoteRequest } from './helpers/request-flow-postgres';

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

it('HA-M2-317: the 72-hour expiry leaves a request flagged for back-office review open', async () => {
  await withRequestFlowDatabase(async database => {
    const flagged = await insertQuoteRequest(database, { createdAgo: '80 hours', roundOpenedAgo: '80 hours' });
    await database.query(`UPDATE bookings SET request_ops_review_at = NOW() - INTERVAL '2 hours',
        request_ops_review_reason = 'max_rounds' WHERE id = $1`, [flagged]);
    const unflagged = await insertQuoteRequest(database, { createdAgo: '80 hours', roundOpenedAgo: '80 hours' });

    expect(await mockSchedulerProcessor!({ name: 'expire-unmatched' })).toEqual({ expiredUnmatched: 1 });

    const rows = (await database.query(`SELECT id, status, cancellation_reason FROM bookings
      WHERE id = ANY($1::uuid[])`, [[flagged, unflagged]])).rows;
    expect(rows.find(r => r.id === flagged)).toEqual({ id: flagged, status: 'requested', cancellation_reason: null });
    expect(rows.find(r => r.id === unflagged))
      .toEqual({ id: unflagged, status: 'cancelled_by_admin', cancellation_reason: 'expired_no_provider' });
  });
}, 90000);
