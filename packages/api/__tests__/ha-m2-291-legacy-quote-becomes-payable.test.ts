// HA-M2-291 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique H4): a quote sent before D38 has no slot, and its request carries
// a placeholder job time that may already have passed ("same day" is created
// + 4 hours). Accepting it now sets the job time to no earlier than now plus
// request_slot_lead_minutes, so the wallet, which refuses a booking whose
// time has passed, accepts the payment. Before this fix such a quote was
// accepted and then could not be paid. Real HTTP on the guarded PostgreSQL
// fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, insertQuote, customerA, providerA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-291: a no-slot legacy quote with a past scheduled_at becomes payable after accept', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { status: 'quoted', scheduledAtSql: "NOW() - INTERVAL '2 hours'" });
    const quoteId = await insertQuote(database, { bookingId, providerId: providerA, earliestDayOffset: null });
    const customer = flowHttp(customerA, 'customer');
    const before = (await database.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now.getTime();

    const accepted = await customer.accept(bookingId, quoteId);

    expect(accepted.status).toBe(200);
    expect(accepted.body.data.scheduledWindow).toBeNull();
    expect(new Date(accepted.body.data.scheduledAt).getTime()).toBeGreaterThanOrEqual(before + 60 * 60_000);
    const paid = await customer.walletPay(bookingId);
    expect(paid.status).toBe(201);
    expect((await database.query('SELECT status FROM bookings WHERE id = $1', [bookingId])).rows[0].status).toBe('paid');
  });
}, 90000);
