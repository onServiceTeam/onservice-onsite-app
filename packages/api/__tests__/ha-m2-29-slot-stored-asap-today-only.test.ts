// HA-M2-29 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// a quote stores the provider's earliest date, time window and "could change
// if" text, and ASAP is accepted only for today: an ASAP quote dated tomorrow
// is refused with 400 QUOTE_SLOT_INVALID. The platform time zone is set so
// the real instant is 10:00 local (helpers/request-flow-postgres
// withPlatformClockAt), so "today" and the 21:00 ASAP cut-off are fixed for
// the test. Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, platformDate, withPlatformClockAt,
  providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-29: slot fields are stored, and ASAP is accepted only for today', async () => {
  await withRequestFlowDatabase(async database => {
    await withPlatformClockAt(10, async () => {
      const today = await insertQuoteRequest(database);
      const tomorrow = await insertQuoteRequest(database);

      const asapToday = await flowHttp(providerUserA, 'provider').quote(today, quoteBody({
        earliestDate: platformDate(0), earliestTimeWindow: 'asap',
        couldChangeIf: 'The compressor needs replacing once I open the unit.',
      }));
      const asapTomorrow = await flowHttp(providerUserB, 'provider').quote(tomorrow, quoteBody({
        earliestDate: platformDate(1), earliestTimeWindow: 'asap',
      }));

      expect(asapToday.status).toBe(201);
      expect((await database.query(`SELECT to_char(earliest_date, 'YYYY-MM-DD') AS earliest_date, earliest_time_window,
          could_change_if FROM booking_quotes WHERE id = $1`, [asapToday.body.data.id])).rows).toEqual([{
        earliest_date: platformDate(0),
        earliest_time_window: 'asap',
        could_change_if: 'The compressor needs replacing once I open the unit.',
      }]);
      expect(asapToday.body.data).toMatchObject({ earliest_date: platformDate(0), earliest_time_window: 'asap' });
      expect(asapTomorrow.status).toBe(400);
      expect(asapTomorrow.body.error).toMatchObject({ code: 'QUOTE_SLOT_INVALID', message: 'ASAP can only be chosen for today.' });
      expect((await database.query('SELECT COUNT(*)::int AS n FROM booking_quotes WHERE booking_id = $1', [tomorrow])).rows[0].n).toBe(0);
    });
  });
}, 90000);
