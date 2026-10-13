// HA-M2-290 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique H1, escalation E83): a customer confirming at 07:xx for a morning
// window (08:00) must not get a job time minutes away, which would leave
// almost no time to pay and drop the booking into the harshest refund tier.
// The job time is the later of the window start and now plus
// request_slot_lead_minutes (60), so here now + 60 minutes, and the wallet
// payment then succeeds. The platform time zone is set so the real instant is
// 07:xx local. Real HTTP (quote, accept, wallet payment) on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, platformDate, withPlatformClockAt,
  customerA, providerUserA,
} from './helpers/request-flow-postgres';
import { platformConfig } from '../src/config/platform.config';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-290: a window starting before now plus the lead gets now plus the lead, and the wallet payment succeeds', async () => {
  await withRequestFlowDatabase(async database => {
    await withPlatformClockAt(7, async () => {
      const bookingId = await insertQuoteRequest(database);
      const earliestDate = platformDate(0);
      const quote = await flowHttp(providerUserA, 'provider').quote(bookingId, quoteBody({ earliestDate, earliestTimeWindow: 'morning' }));
      expect(quote.status).toBe(201);
      const windowStart = (await database.query<{ start: Date }>(
        `SELECT ($1::date + TIME '08:00') AT TIME ZONE $2::text AS start`, [earliestDate, platformConfig.timezone],
      )).rows[0]!.start.getTime();
      const customer = flowHttp(customerA, 'customer');
      const clock = async () => (await database.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now.getTime();

      const before = await clock();
      const accepted = await customer.accept(bookingId, quote.body.data.id);
      const after = await clock();

      expect(accepted.status).toBe(200);
      const scheduledAt = new Date(accepted.body.data.scheduledAt).getTime();
      expect(scheduledAt).toBeGreaterThanOrEqual(before + 60 * 60_000);
      expect(scheduledAt).toBeLessThanOrEqual(after + 60 * 60_000);
      expect(scheduledAt).toBeGreaterThanOrEqual(windowStart);
      const paid = await customer.walletPay(bookingId);
      expect(paid.status).toBe(201);
      expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id = $1', [bookingId])).rows)
        .toEqual([{ status: 'paid', escrow_status: 'held' }]);
    });
  });
}, 90000);
