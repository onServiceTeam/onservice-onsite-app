// HA-M3-11 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 77): a request is alerted once per kind and round.
// The scheduler's own processor runs the marketplace-alerts-sweep job twice
// over a request waiting 6 minutes: the first run raises its amber alert, the
// second raises nothing and the request still has exactly one alert. Only
// BullMQ's Redis connection is replaced; the sweep runs real SQL on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { alertsOf, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

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

it('HA-M3-11: a second sweep raises nothing for a request already alerted in its round', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });

    expect(await mockSchedulerProcessor!({ name: 'marketplace-alerts-sweep' }))
      .toEqual({ marketplaceAlerts: { raised: 1, resolved: 0 } });
    expect(await mockSchedulerProcessor!({ name: 'marketplace-alerts-sweep' }))
      .toEqual({ marketplaceAlerts: { raised: 0, resolved: 0 } });

    expect((await alertsOf(database, bookingId)).map(alert => [alert.kind, alert.request_round, alert.open]))
      .toEqual([['request_waiting_amber', 1, true]]);
  });
}, 90000);
