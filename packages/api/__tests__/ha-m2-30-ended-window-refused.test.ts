// HA-M2-30 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique section 2.2): a quote offering a time window that can no longer be
// confirmed is refused with 400 QUOTE_SLOT_INVALID and nothing is stored.
// That is a window that already ended today (at 14:xx local, the morning
// window 08:00 to 12:00), and also one ending within the lead time
// request_slot_lead_minutes (60) (at 11:xx local, the same window ends before
// a customer could confirm and still get now + 60 minutes). The platform time
// zone is set so the real instant is at those local hours. Real HTTP on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, platformDate, withPlatformClockAt,
  providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-30: a window that ended today, or ends within the lead time, gets QUOTE_SLOT_INVALID', async () => {
  await withRequestFlowDatabase(async database => {
    for (const localHour of [14, 11]) {
      await withPlatformClockAt(localHour, async () => {
        const bookingId = await insertQuoteRequest(database);

        const response = await flowHttp(providerUserA, 'provider').quote(bookingId, quoteBody({
          earliestDate: platformDate(0), earliestTimeWindow: 'morning',
        }));

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('QUOTE_SLOT_INVALID');
        expect((await database.query('SELECT COUNT(*)::int AS n FROM booking_quotes WHERE booking_id = $1', [bookingId])).rows[0].n).toBe(0);
        expect((await database.query('SELECT status FROM bookings WHERE id = $1', [bookingId])).rows[0].status).toBe('requested');
      });
    }
  });
}, 90000);
