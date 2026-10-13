// HA-M2-69 (customer human audit 2026-10-13, D38 Milestone 2, package P2): a
// quote request stuck in 'quoted' from before D38 (its only quote expired 79
// hours ago, and nothing ever reopened it) is first reconciled by the expiry
// sweep (round 2, with its round clock backdated to when the quote lapsed and
// no "reopened" notice), and the same run then expires it as
// 'expired_no_provider'. This is hard stop 2 territory on live and needs
// Ken's go-ahead before deploy (merged plan question 12). The scheduler's own
// processor runs the step over real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, insertQuote, notificationsOf, customerA, providerA,
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

it('HA-M2-69: a legacy stuck quoted request is reconciled silently, then expires', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { status: 'quoted', createdAgo: '80 hours' });
    await insertQuote(database, { bookingId, providerId: providerA, status: 'expired', expiresAtSql: "NOW() - INTERVAL '79 hours'" });

    expect(await mockSchedulerProcessor!({ name: 'expire-unmatched' })).toEqual({ expiredUnmatched: 1 });

    expect((await database.query(`SELECT b.status, b.cancellation_reason, b.request_round,
        b.request_round_opened_at = q.expires_at AS backdated
      FROM bookings b JOIN booking_quotes q ON q.booking_id = b.id WHERE b.id = $1`, [bookingId])).rows)
      .toEqual([{ status: 'cancelled_by_admin', cancellation_reason: 'expired_no_provider', request_round: 2, backdated: true }]);
    expect((await notificationsOf(database, customerA)).filter(n => n.data.bookingId === bookingId).map(n => n.type))
      .toEqual(['booking_expired']);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM job_request_invites WHERE booking_id = $1', [bookingId])).rows[0].n).toBe(0);
  });
}, 90000);
