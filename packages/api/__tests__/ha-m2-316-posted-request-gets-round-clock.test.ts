// HA-M2-316 (customer human audit 2026-10-13, D38 Milestone 2, package P2
// review fix; P2 overflow number, see HA-M2-310): the worker's still-looking
// and re-fan-out sweeps act only on rounds the D38 engine opened, which
// keeps them away from requests posted before the deploy (HA-M2-310). So a
// request posted through the app must carry its round clock from the start:
// createJobRequest stamps request_round_opened_at with the creation time.
// Without the stamp, a customer who posts a request that no provider answers
// would never get the "still looking" notice, and a lost round-1 fan-out
// would never be re-run.
//
// Setup: customer A posts a request through the real route; its fan-out
// pushes providers A and B. Both clocks are then moved 40 minutes back
// together (the stored values are shifted, never invented), nobody having
// quoted, and the worker's still-looking step runs. Real HTTP and the
// scheduler's own processor over real rows on the guarded PostgreSQL
// fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, notificationsOf, waitUntil, customerA, quoteService,
} from './helpers/request-flow-postgres';
import { jobRequestBody } from './helpers/job-request-postgres';

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

it('HA-M2-316: a request posted through the app carries its round clock, so the still-looking notice reaches it', async () => {
  await withRequestFlowDatabase(async database => {
    const created = await flowHttp(customerA, 'customer').jobRequest(jobRequestBody({ subcategoryId: quoteService }));
    expect(created.status).toBe(201);
    const bookingId = created.body.data.id as string;
    await waitUntil(async () => (await database.query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE type = 'new_job_request' AND data->>'bookingId' = $1`,
      [bookingId])).rows[0].n === 2, 'the round 1 fan-out pushes');
    expect((await database.query(`SELECT request_round_opened_at = created_at AS stamped_at_creation
      FROM bookings WHERE id = $1`, [bookingId])).rows).toEqual([{ stamped_at_creation: true }]);
    await database.query(`UPDATE bookings SET created_at = created_at - INTERVAL '40 minutes',
        request_round_opened_at = request_round_opened_at - INTERVAL '40 minutes' WHERE id = $1`, [bookingId]);

    expect(await mockSchedulerProcessor!({ name: 'request-still-looking' })).toEqual({ stillLooking: 1 });

    expect((await notificationsOf(database, customerA)).filter(n => n.type === 'request_still_looking')
      .map(n => n.data.bookingId)).toEqual([bookingId]);
  });
}, 90000);
