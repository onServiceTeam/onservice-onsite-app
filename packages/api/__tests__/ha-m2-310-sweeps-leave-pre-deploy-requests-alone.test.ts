// HA-M2-310 (customer human audit 2026-10-13, D38 Milestone 2, package P2
// review fix; P2 overflow number: the P2 range 20-79 and the critique's
// 290-309 are used up, so the P2 review fixes number their tests from 310):
// the two new 5-minute sweeps, the customer's "still looking" notice and the
// re-fan-out of a lost round, leave alone every open quote request that was
// posted before the D38 engine went live. Those rows have no invite records
// and no round clock (migration 183 adds both with no backfill), and the old
// D27 fan-out already pushed them to providers, so the first deploy must not
// push them again, tell their customers "still looking", or flag the ones the
// stricter eligibility rule no longer reaches for the back office (a flagged
// request is exempt from the 72-hour expiry, so it would never close).
//
// Setup: three requests stored before the deploy (10 hours and 40 minutes
// old, plus one nobody can reach any more), and one control request the D38
// engine posted 40 minutes ago whose fan-out was lost. Only the control gets
// the notice and the invites. The scheduler's own processor runs the steps
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

it('HA-M2-310: the still-looking and re-fan-out sweeps leave requests posted before the deploy alone', async () => {
  await withRequestFlowDatabase(async database => {
    const olderPreDeploy = await insertQuoteRequest(database, { createdAgo: '10 hours' });
    const recentPreDeploy = await insertQuoteRequest(database, { createdAgo: '40 minutes' });
    const unreachablePreDeploy = await insertQuoteRequest(database, { createdAgo: '10 hours' });
    await database.query('UPDATE bookings SET latitude = 14.6, longitude = 121.0 WHERE id = $1', [unreachablePreDeploy]);
    const control = await insertQuoteRequest(database, { createdAgo: '40 minutes', roundOpenedAgo: '40 minutes' });

    const results: Record<string, unknown> = {};
    for (const name of ['request-still-looking', 'request-refanout']) {
      Object.assign(results, await mockSchedulerProcessor!({ name }));
    }

    expect(results).toEqual({ stillLooking: 1, refanout: 1 });
    expect((await database.query(`SELECT DISTINCT data->>'bookingId' AS booking_id FROM notifications`)).rows)
      .toEqual([{ booking_id: control }]);
    expect((await invitesOf(database, control)).map(i => i.provider_id).sort()).toEqual([providerA, providerB].sort());
    expect((await database.query(`SELECT COUNT(*)::int AS n FROM job_request_invites WHERE booking_id <> $1`, [control]))
      .rows[0].n).toBe(0);
    expect((await database.query(`SELECT id, status, request_ops_review_at, request_still_looking_notified_at
      FROM bookings WHERE id = ANY($1::uuid[]) ORDER BY id`, [[olderPreDeploy, recentPreDeploy, unreachablePreDeploy]])).rows)
      .toEqual([olderPreDeploy, recentPreDeploy, unreachablePreDeploy].sort().map(id => ({
        id, status: 'requested', request_ops_review_at: null, request_still_looking_notified_at: null,
      })));
  });
}, 90000);
