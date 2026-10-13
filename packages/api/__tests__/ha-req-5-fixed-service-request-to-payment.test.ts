// HA-REQ-5 (customer human audit 2026-10-13, D38): request-first must not
// break payment. A customer requests a FIXED-price service (catalog price
// 50,000 centavos), the provider sends a quote of 80,000, the customer accepts
// it, and the booking becomes payment_pending at the quote's price, then pays
// from the wallet. Every step runs through the mounted routes and real SQL.
// No money logic changed for D38: acceptQuote and the wallet payment are the
// existing code paths, and this test proves they still apply to a request
// made on a fixed-price service.
import {
  bookingIntegrationIt as it, customerA, customerWalletA, escrowWallet, providerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  withJobRequestDatabase, marketplaceHttp, jobRequestBody, waitForLeadFanOut, fixedService,
} from './helpers/job-request-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const mockPush = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => ({
  ...jest.requireActual('../src/services/notification.service'),
  sendPushNotification: (...args: unknown[]) => mockPush(...args),
}));

it('HA-REQ-5: a fixed-price service request goes request, quote, accept, payment_pending at the quote price, then wallet payment', async () => {
  await withJobRequestDatabase(async database => {
    const customer = marketplaceHttp(customerA, 'customer');
    const provider = marketplaceHttp(providerUserA, 'provider');

    // 1. The customer describes the job and sets a budget range.
    const created = await customer.jobRequest(jobRequestBody({
      subcategoryId: fixedService, budgetMin: 60000, budgetMax: 90000,
    }));
    expect(created.status).toBe(201);
    const bookingId = created.body.data.id as string;
    await waitForLeadFanOut(mockPush, 1);

    // 2. The provider who received the lead sends a price.
    const quoted = await provider.quote(bookingId, {
      quotedPrice: 80000,
      description: 'Clean and re-gas the bedroom split-type unit, check the drain line.',
    });
    expect(quoted.status).toBe(201);
    const quoteId = quoted.body.data.id as string;
    expect((await database.query('SELECT status FROM bookings WHERE id=$1', [bookingId])).rows)
      .toEqual([{ status: 'quoted' }]);

    // 3. The customer accepts. The fixture's 25% customer fee makes 100,000.
    const accepted = await customer.accept(bookingId, quoteId);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toEqual({ quoteId, providerId: providerA, totalAmount: 100000 });
    expect((await database.query(`SELECT status, booking_type, provider_id, subcategory_id,
        service_price::text AS price, service_fee::text AS fee, total_amount::text AS total,
        escrow_status FROM bookings WHERE id=$1`, [bookingId])).rows).toEqual([{
      status: 'payment_pending', booking_type: 'quote_based', provider_id: providerA,
      subcategory_id: fixedService, price: '80000', fee: '20000', total: '100000', escrow_status: 'pending',
    }]);
    expect((await database.query(`SELECT fixed_by_event, provider_id, service_price_centavos::text AS price,
        total_amount_centavos::text AS total FROM booking_financial_terms WHERE booking_id=$1 ORDER BY version`,
    [bookingId])).rows).toEqual([
      { fixed_by_event: 'quote_accepted', provider_id: providerA, price: '80000', total: '100000' },
    ]);

    // 4. The existing wallet payment takes the accepted quote's total.
    const paid = await customer.walletPay(bookingId);
    expect(paid.status).toBe(201);
    expect((await database.query('SELECT status, escrow_status, payment_method FROM bookings WHERE id=$1',
      [bookingId])).rows).toEqual([{ status: 'paid', escrow_status: 'held', payment_method: 'wallet' }]);
    expect((await database.query(`SELECT wallet_id, amount::text FROM wallet_transactions
        WHERE booking_id=$1 ORDER BY amount`, [bookingId])).rows).toEqual([
      { wallet_id: customerWalletA, amount: '-100000' },
      { wallet_id: escrowWallet, amount: '100000' },
    ]);
  }, { requestFirstBooking: 'true' });
}, 60000);
