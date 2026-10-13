// HA-M2-307 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique "verified as correct"): once a decline reopens a request it is
// back at 'requested' with no accepted price, and the wallet refuses to pay
// it; no wallet money, payment record or status changes. (The state machine
// allows requested -> payment_pending, so today the 0 total is what stops
// it; this test pins that the refusal holds.) Real HTTP (quote, decline,
// wallet payment) on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it, customerWalletA } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-307: wallet payment on a reopened quote request is refused', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const quoteId = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id;
    const customer = flowHttp(customerA, 'customer');
    expect((await customer.decline(bookingId, quoteId, { reason: 'too_expensive' })).body.data.bookingStatus).toBe('requested');
    const money = async () => ({
      wallet: (await database.query('SELECT available_balance FROM wallets WHERE id = $1', [customerWalletA])).rows,
      intents: (await database.query('SELECT id FROM payment_intents WHERE booking_id = $1', [bookingId])).rows,
      booking: (await database.query('SELECT status, escrow_status, total_amount FROM bookings WHERE id = $1', [bookingId])).rows,
    });
    const before = await money();

    const response = await customer.walletPay(bookingId);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await money()).toEqual(before);
    expect(before.booking).toEqual([{ status: 'requested', escrow_status: 'pending', total_amount: 0 }]);
  });
}, 90000);
