// HA-M2-312 (customer human audit 2026-10-13, D38 Milestone 2, package P2
// review fix; P2 overflow number, see HA-M2-310): the re-fan-out sweep
// (critique M5) recovers a fan-out lost to a crash or restart, which shows up
// within minutes. A reopened round whose fan-out ran and found nobody to
// notify leaves no invite either, and the sweep cannot tell the two apart, so
// it retries a round only during its first hour. Before the fix such a round
// was retried every 5 minutes until the 72-hour expiry, and as the oldest
// rows it could fill the sweep's 50-row batch ahead of newer lost rounds.
// Providers who come online later still find the request in their Requests
// list; they are just not pushed.
//
// Setup: round 2 of a request opened 10 minutes ago while both eligible
// providers are offline. The sweep retries it and invites nobody. Once the
// round is more than an hour old the sweep no longer picks it up, even with
// both providers back online. The scheduler's own processor runs the step
// over real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, invitesOf, providerA, providerB,
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

it('HA-M2-312: a round the fan-out found nobody for is retried only during its first hour', async () => {
  await withRequestFlowDatabase(async database => {
    await database.query('UPDATE providers SET is_available = FALSE WHERE id IN ($1, $2)', [providerA, providerB]);
    const bookingId = await insertQuoteRequest(database, { round: 2, createdAgo: '5 hours', roundOpenedAgo: '10 minutes' });

    expect(await mockSchedulerProcessor!({ name: 'request-refanout' })).toEqual({ refanout: 1 });
    expect(await invitesOf(database, bookingId)).toEqual([]);

    await database.query(`UPDATE bookings SET request_round_opened_at = NOW() - INTERVAL '61 minutes' WHERE id = $1`, [bookingId]);
    await database.query('UPDATE providers SET is_available = TRUE WHERE id IN ($1, $2)', [providerA, providerB]);

    expect(await mockSchedulerProcessor!({ name: 'request-refanout' })).toEqual({ refanout: 0 });
    expect(await invitesOf(database, bookingId)).toEqual([]);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n).toBe(0);
  });
}, 90000);
