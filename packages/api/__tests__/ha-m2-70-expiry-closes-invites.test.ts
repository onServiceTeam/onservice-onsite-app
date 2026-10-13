// HA-M2-70 (customer human audit 2026-10-13, D38 Milestone 2, package P2): when
// the 72-hour expiry closes a quote request, its open invites close too
// ('expired' with a close time), so the request leaves the invited
// providers' lists and the invite record shows how it ended. The scheduler's
// own processor runs the step over real rows on the guarded PostgreSQL
// fixture.
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

it('HA-M2-70: the unmatched expiry closes the request\'s open invites', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { createdAgo: '73 hours' });
    await database.query(`INSERT INTO job_request_invites (booking_id, provider_id, round, source, status, viewed_at)
      VALUES ($1, $2, 1, 'push', 'sent', NULL), ($1, $3, 1, 'push', 'viewed', NOW())`, [bookingId, providerA, providerB]);

    await mockSchedulerProcessor!({ name: 'expire-unmatched' });

    expect((await invitesOf(database, bookingId)).map(i => [i.provider_id, i.status, i.closed]).sort())
      .toEqual([[providerA, 'expired', true], [providerB, 'expired', true]].sort());
  });
}, 90000);
