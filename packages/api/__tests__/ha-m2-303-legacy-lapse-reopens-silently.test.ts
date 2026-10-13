// HA-M2-303 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique section 2.2): a quote that lapsed long before the worker saw it
// (its expiry was three hours ago, for example after the worker was down)
// reopens its request silently: round 2 with the round clock backdated to the
// lapse, no customer notice and no new-round invites. The provider still gets
// the existing expiry notice for their own quote.
//
// Review fix: production schedules only the 5-minute 'all' job, which runs
// the "still looking" notice and the re-fan-out sweep after the expiry steps
// in the same pass. Both used to pick the silently reopened row straight up
// (a "still looking" push to the customer and a "request reopened" push to
// provider B), so the test now runs every D38 step of the 'all' job in its
// order: expire-quotes, expire-unmatched, request-still-looking,
// request-refanout. (autoConfirm, detectNoShows and the dispute escalation
// run in between in production; they do not read quote requests and need
// tables this fixture does not have.) The scheduler's own processor runs the
// steps over real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, insertQuote, invitesOf, notificationsOf,
  customerA, providerA, providerUserA, providerUserB,
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

it('HA-M2-303: a legacy lapse reopens silently', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { status: 'quoted', createdAgo: '5 hours' });
    const quoteId = await insertQuote(database, { bookingId, providerId: providerA, expiresAtSql: "NOW() - INTERVAL '3 hours'" });

    const results: Record<string, unknown> = {};
    for (const name of ['expire-quotes', 'expire-unmatched', 'request-still-looking', 'request-refanout']) {
      Object.assign(results, await mockSchedulerProcessor!({ name }));
    }

    expect(results).toEqual({ expired: 1, expiredUnmatched: 0, stillLooking: 0, refanout: 0 });
    expect((await database.query(`SELECT b.status, b.request_round, b.request_round_opened_at = q.expires_at AS backdated
      FROM bookings b JOIN booking_quotes q ON q.id = $2 WHERE b.id = $1`, [bookingId, quoteId])).rows)
      .toEqual([{ status: 'requested', request_round: 2, backdated: true }]);
    expect((await notificationsOf(database, customerA)).filter(n => n.data.bookingId === bookingId)).toEqual([]);
    expect(await invitesOf(database, bookingId)).toEqual([]);
    expect((await notificationsOf(database, providerUserA)).map(n => n.type)).toEqual(['quote_expired']);
    expect(await notificationsOf(database, providerUserB)).toEqual([]);
  });
}, 90000);
