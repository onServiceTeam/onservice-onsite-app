// HA-M2-68 (customer human audit 2026-10-13, D38 Milestone 2, package P2): the
// 72-hour unmatched expiry cancels a quote request with cancellation_reason
// 'expired_no_provider' and a cancellation time, and tells the customer in
// request words; a fixed-price booking expired in the same run keeps a NULL
// reason and its old notice. The scheduler's own processor runs the step over
// real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, notificationsOf, customerA,
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

it('HA-M2-68: unmatched expiry writes expired_no_provider and cancelled_at; the fixed-price reason stays NULL', async () => {
  await withRequestFlowDatabase(async database => {
    const requestId = await insertQuoteRequest(database, { createdAgo: '73 hours' });
    const fixedId = await insertQuoteRequest(database, { createdAgo: '73 hours', bookingType: 'fixed_price' });

    expect(await mockSchedulerProcessor!({ name: 'expire-unmatched' })).toEqual({ expiredUnmatched: 2 });

    const rows = (await database.query(`SELECT id, status, cancellation_reason, cancelled_at IS NOT NULL AS cancelled
      FROM bookings WHERE id IN ($1, $2)`, [requestId, fixedId])).rows;
    expect(rows.find(r => r.id === requestId)).toEqual({
      id: requestId, status: 'cancelled_by_admin', cancellation_reason: 'expired_no_provider', cancelled: true,
    });
    expect(rows.find(r => r.id === fixedId)).toMatchObject({ status: 'cancelled_by_admin', cancellation_reason: null });
    const notices = (await notificationsOf(database, customerA)).filter(n => n.type === 'booking_expired');
    expect(notices.find(n => n.data.bookingId === requestId)!.body)
      .toBe('No pro could take your request in time, so it has been closed. You can post it again.');
    expect(notices.find(n => n.data.bookingId === fixedId)!.body)
      .toBe('We were unable to find a provider for your booking. It has been cancelled. Please try booking again.');
  });
}, 90000);
