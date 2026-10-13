// HA-M2-292 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique M2): a quote whose slot can no longer be confirmed must not block
// the request for the full quote lifetime (48 hours). Its expiry is capped at
// the window's end minus request_slot_lead_minutes (12:00 - 60 minutes for
// today's morning window, with the platform zone set so the real instant is
// 10:xx local), and once that moment passes the expiry worker frees the
// open-quote place for another provider. Passing time is simulated by moving
// the stored expiry into the past. Real HTTP and the scheduler's own
// processor on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, platformDate, withPlatformClockAt,
  providerUserA, providerUserB,
} from './helpers/request-flow-postgres';
import { platformConfig } from '../src/config/platform.config';

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

it('HA-M2-292: expires_at is capped at the window end minus the lead, and the lapse frees the cap', async () => {
  await withRequestFlowDatabase(async database => {
    await withPlatformClockAt(10, async () => {
      const bookingId = await insertQuoteRequest(database);
      const earliestDate = platformDate(0);
      const quote = await flowHttp(providerUserA, 'provider').quote(bookingId, quoteBody({ earliestDate, earliestTimeWindow: 'morning' }));
      expect(quote.status).toBe(201);

      expect((await database.query(`SELECT expires_at = (($2::date + TIME '12:00') AT TIME ZONE $3::text) - INTERVAL '60 minutes' AS capped
        FROM booking_quotes WHERE id = $1`, [quote.body.data.id, earliestDate, platformConfig.timezone])).rows[0].capped).toBe(true);
      expect((await flowHttp(providerUserB, 'provider').quote(bookingId, quoteBody())).status).toBe(409);

      await database.query(`UPDATE booking_quotes SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`, [quote.body.data.id]);
      await mockSchedulerProcessor!({ name: 'expire-quotes' });

      expect((await flowHttp(providerUserB, 'provider').quote(bookingId, quoteBody())).status).toBe(201);
    });
  });
}, 90000);
