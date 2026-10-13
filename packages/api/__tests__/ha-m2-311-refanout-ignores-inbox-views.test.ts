// HA-M2-311 (customer human audit 2026-10-13, D38 Milestone 2, package P2
// review fix; P2 overflow number, see HA-M2-310): the re-fan-out sweep
// (critique M5) looks for a round with no pushed invite, not a round with no
// invite of any kind. Opening a request from the Requests list records an
// 'inbox' invite for that provider; it must not count as the round having
// been sent out. Before the fix, one provider opening a request whose
// fan-out was lost stopped the sweep for good, and no other provider was
// ever pushed.
//
// Setup: a request posted 5 minutes ago whose fan-out was lost; provider A
// opens it through the real lead-detail route. The sweep then pushes
// provider B, and leaves provider A's own inbox invite as it was (A already
// has the request open, so A is not pushed). Real HTTP and the scheduler's
// own processor over real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, invitesOf, notificationsOf,
  providerA, providerB, providerUserA, providerUserB,
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

it('HA-M2-311: an inbox view does not stop the re-fan-out sweep from pushing the other providers', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { createdAgo: '5 minutes', roundOpenedAgo: '5 minutes' });
    expect((await flowHttp(providerUserA, 'provider').lead(bookingId)).status).toBe(200);

    expect(await mockSchedulerProcessor!({ name: 'request-refanout' })).toEqual({ refanout: 1 });

    expect((await invitesOf(database, bookingId)).map(i => [i.provider_id, i.round, i.source, i.status]))
      .toEqual([[providerA, 1, 'inbox', 'viewed'], [providerB, 1, 'push', 'sent']]);
    expect((await notificationsOf(database, providerUserB)).map(n => [n.type, n.data.bookingId]))
      .toEqual([['new_job_request', bookingId]]);
    expect(await notificationsOf(database, providerUserA)).toEqual([]);
  });
}, 90000);
