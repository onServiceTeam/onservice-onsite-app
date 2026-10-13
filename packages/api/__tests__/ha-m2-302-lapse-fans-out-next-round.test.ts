// HA-M2-302 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique M3): when the request's last live quote lapses, the reopened
// round 2 is sent to other eligible providers (D38: a request that did not
// become a booking goes to other providers), as a reopened request with no
// decline reason. The provider whose quote lapsed is not invited again. The
// scheduler's own processor runs the expiry step over real rows on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, insertQuote, invitesOf, notificationsOf,
  providerA, providerB, providerUserB,
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

it('HA-M2-302: a lapse that brings live quotes to 0 fans out round 2 to other providers', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { status: 'quoted' });
    await insertQuote(database, { bookingId, providerId: providerA, expiresAtSql: "NOW() - INTERVAL '1 minute'" });

    await mockSchedulerProcessor!({ name: 'expire-quotes' });

    expect((await invitesOf(database, bookingId)).map(i => [i.provider_id, i.round, i.source]))
      .toEqual([[providerB, 2, 'push']]);
    expect((await invitesOf(database, bookingId)).some(i => i.provider_id === providerA)).toBe(false);
    expect((await notificationsOf(database, providerUserB)).map(n => [n.type, n.body])).toEqual([
      ['job_request_reopened', 'A customer is looking for another pro: Aircon repair in Cebu City.'],
    ]);
  });
}, 90000);
