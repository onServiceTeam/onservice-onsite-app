// HA-M2-48 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// escalation E83 interim default): accepting a quote whose window has
// already started sets the job time to the database clock plus
// request_slot_lead_minutes (60), never the window's start, which is in the
// past. The platform time zone is set so the real instant is 10:00 local:
// today's morning window (08:00 to 12:00) has started. Real HTTP on the
// guarded PostgreSQL fixture; the expected time is bracketed by database
// clock reads taken before and after the accept.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, platformDate, withPlatformClockAt,
  customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-48: a window that has started gives database now plus the lead minutes', async () => {
  await withRequestFlowDatabase(async database => {
    await withPlatformClockAt(10, async () => {
      const bookingId = await insertQuoteRequest(database);
      const quote = await flowHttp(providerUserA, 'provider').quote(bookingId, quoteBody({
        earliestDate: platformDate(0), earliestTimeWindow: 'morning',
      }));
      expect(quote.status).toBe(201);
      const clock = async () => (await database.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now.getTime();

      const before = await clock();
      const accepted = await flowHttp(customerA, 'customer').accept(bookingId, quote.body.data.id);
      const after = await clock();

      expect(accepted.status).toBe(200);
      const row = (await database.query('SELECT scheduled_at, scheduled_window FROM bookings WHERE id = $1', [bookingId])).rows[0];
      expect(row.scheduled_window).toBe('morning');
      expect(row.scheduled_at.getTime()).toBeGreaterThanOrEqual(before + 60 * 60_000);
      expect(row.scheduled_at.getTime()).toBeLessThanOrEqual(after + 60 * 60_000);
      expect(new Date(accepted.body.data.scheduledAt).getTime()).toBe(row.scheduled_at.getTime());
    });
  });
}, 90000);
