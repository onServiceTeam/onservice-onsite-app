// HA-M2-67 (customer human audit 2026-10-13, D38 Milestone 2, package P2): when
// a request's only live quote lapses, the expiry worker reopens the request
// (back to 'requested', round 2, fresh round clock) and tells the customer
// "Your quote from {provider} expired. We've reopened your request." The
// provider whose quote lapsed gets the existing expiry notice and is not sent
// the reopened request. (The merged plan's "no provider push" on a lapse was
// superseded by critique M3: the new round now goes to OTHER providers, see
// HA-M2-302.) The scheduler's own processor runs the step over real rows on
// the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, insertQuote, notificationsOf, customerA, providerA, providerUserA,
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

it('HA-M2-67: a lapsed last quote reopens the request and the customer is told', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { status: 'quoted' });
    await insertQuote(database, { bookingId, providerId: providerA, expiresAtSql: "NOW() - INTERVAL '1 minute'" });

    expect(await mockSchedulerProcessor!({ name: 'expire-quotes' })).toEqual({ expired: 1 });

    expect((await database.query(`SELECT status, request_round, request_declined_rounds,
        request_round_opened_at > NOW() - INTERVAL '1 minute' AS reopened_now
      FROM bookings WHERE id = $1`, [bookingId])).rows)
      .toEqual([{ status: 'requested', request_round: 2, request_declined_rounds: 0, reopened_now: true }]);
    expect((await notificationsOf(database, customerA)).filter(n => n.type === 'quote_expired').map(n => n.body))
      .toEqual(['Your quote from Synthetic Aircon Team A expired. We\'ve reopened your request.']);
    expect((await notificationsOf(database, providerUserA)).map(n => [n.type, n.body])).toEqual([
      ['quote_expired', 'Your quote was not accepted within the time limit and has expired.'],
    ]);
  });
}, 90000);
