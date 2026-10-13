// HA-M2-301 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique M12): when the customer cancels a quoted request, the provider
// holding a live quote is told "The customer cancelled their request", and
// when that quote later expires the worker sends them no misleading "your
// quote was not accepted" notice, and does not reopen the cancelled request.
// Real HTTP (the customer's cancel through PATCH /status) and the scheduler's
// own processor on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, notificationsOf, customerA, providerUserA,
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

it('HA-M2-301: cancelling a quoted request tells live-quote providers and sends no expiry notice later', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const quoteId = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id;

    const cancelled = await flowHttp(customerA, 'customer').cancel(bookingId);
    expect(cancelled.status).toBe(200);
    expect((await notificationsOf(database, providerUserA)).filter(n => n.type === 'job_request_cancelled').map(n => n.body))
      .toEqual(['The customer cancelled their request for Aircon repair.']);

    await database.query(`UPDATE booking_quotes SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`, [quoteId]);
    expect(await mockSchedulerProcessor!({ name: 'expire-quotes' })).toEqual({ expired: 1 });

    expect((await notificationsOf(database, providerUserA)).filter(n => n.type === 'quote_expired')).toEqual([]);
    expect((await database.query('SELECT status, request_round FROM bookings WHERE id = $1', [bookingId])).rows)
      .toEqual([{ status: 'cancelled_by_customer', request_round: 1 }]);
  });
}, 90000);
