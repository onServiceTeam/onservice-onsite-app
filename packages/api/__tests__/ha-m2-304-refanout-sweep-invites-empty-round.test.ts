// HA-M2-304 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique M5): the fan-out after a request is posted runs after the commit,
// so a crash or restart can lose it. The 5-minute worker step re-runs it for
// an open request whose current round has no invite at all and opened more
// than 2 minutes ago; a request posted a moment ago is left to its own
// fan-out. The scheduler's own processor runs the step over real rows on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, invitesOf, notificationsOf, providerA, providerB, providerUserA,
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

it('HA-M2-304: the re-fan-out sweep invites a round that has zero invites', async () => {
  await withRequestFlowDatabase(async database => {
    const lost = await insertQuoteRequest(database, { createdAgo: '5 minutes', roundOpenedAgo: '5 minutes' });
    const fresh = await insertQuoteRequest(database, { createdAgo: '30 seconds', roundOpenedAgo: '30 seconds' });

    expect(await mockSchedulerProcessor!({ name: 'request-refanout' })).toEqual({ refanout: 1 });

    expect((await invitesOf(database, lost)).map(i => [i.provider_id, i.round, i.source]).sort())
      .toEqual([[providerA, 1, 'push'], [providerB, 1, 'push']].sort());
    expect(await invitesOf(database, fresh)).toEqual([]);
    expect((await notificationsOf(database, providerUserA)).map(n => [n.type, n.data.bookingId]))
      .toEqual([['new_job_request', lost]]);
  });
}, 90000);
