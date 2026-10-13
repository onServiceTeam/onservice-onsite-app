// HA-M2-318 (customer human audit 2026-10-13, D38 Milestone 2; W3-A overflow
// number for an item the P2 build report left untested): a reopen restarts
// the 72-hour unmatched expiry. The clock is
// COALESCE(request_round_opened_at, created_at), and a reopen stamps
// request_round_opened_at with the reopen time, so a request posted 80 hours
// ago whose only quote the customer just declined (round 2 opens now) is not
// expired, while another request posted 80 hours ago with no reopen is. The
// decline goes through the real route; the scheduler's own processor runs
// 'expire-unmatched' over real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuote, insertQuoteRequest, customerA, providerA,
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

it('HA-M2-318: a reopen restarts the 72-hour clock from request_round_opened_at', async () => {
  await withRequestFlowDatabase(async database => {
    const reopened = await insertQuoteRequest(database, { status: 'quoted', createdAgo: '80 hours', roundOpenedAgo: '80 hours' });
    const quoteId = await insertQuote(database, { bookingId: reopened, providerId: providerA });
    const untouched = await insertQuoteRequest(database, { createdAgo: '80 hours', roundOpenedAgo: '80 hours' });

    const declined = await flowHttp(customerA, 'customer').decline(reopened, quoteId, { reason: 'too_expensive' });
    expect(declined.body.data).toMatchObject({ bookingStatus: 'requested', round: 2, reopened: true });

    expect(await mockSchedulerProcessor!({ name: 'expire-unmatched' })).toEqual({ expiredUnmatched: 1 });

    const rows = (await database.query(`SELECT id, status, request_round,
        request_round_opened_at > NOW() - INTERVAL '1 minute' AS clock_restarted
      FROM bookings WHERE id = ANY($1::uuid[])`, [[reopened, untouched]])).rows;
    expect(rows.find(r => r.id === reopened)).toEqual({ id: reopened, status: 'requested', request_round: 2, clock_restarted: true });
    expect(rows.find(r => r.id === untouched)).toMatchObject({ status: 'cancelled_by_admin' });
  });
}, 90000);
