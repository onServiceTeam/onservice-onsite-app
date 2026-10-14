// HA-M3-17 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 82): when the 72-hour expiry closes a quote request
// that never got a quote, the next sweep raises one request_unfilled alert
// recorded as closed by the system. The scheduler's own processor runs the
// real expire-unmatched step, then the real sweep, on the guarded PostgreSQL
// fixture (only BullMQ's Redis connection is replaced). The request's wait
// began 73 hours ago, outside the lookback, so it raises no waiting alert.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { alertsOf, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

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

it('HA-M3-17: a request that expires with no quote raises request_unfilled', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { createdAgo: '73 hours', roundOpenedAgo: '73 hours' });
    expect(await mockSchedulerProcessor!({ name: 'expire-unmatched' })).toEqual({ expiredUnmatched: 1 });

    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });

    expect(await alertsOf(database, bookingId)).toEqual([{
      booking_id: bookingId, kind: 'request_unfilled', request_round: 1, threshold_minutes: null,
      resolution: null, open: true, acknowledged: false,
    }]);
    expect((await database.query('SELECT details FROM marketplace_alerts WHERE booking_id = $1', [bookingId])).rows[0].details)
      .toMatchObject({ closedBy: 'system', notified: 0, viewed: 0 });
  });
}, 90000);
