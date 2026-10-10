import { withQuotePaymentDatabase, walletPayHttp, quotedBooking } from './helpers/quote-payment-postgres';
import {
  bookingIntegrationIt as it, customerA, customerWalletA, escrowWallet, providerA,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug OPS-559 - a customer can pay an accepted custom quote from the wallet', async () => {
  await withQuotePaymentDatabase(async database => {
    // Before OPS-559 this answered 409 'Cannot pay for a booking in
    // "payment_pending" status.': accepting a quote leaves the booking at
    // payment_pending, and the wallet payment only accepted statuses that
    // could still move to payment_pending.
    const response = await walletPayHttp(customerA)(quotedBooking);

    expect(response.status).toBe(201);
    const intents = (await database.query(`SELECT id, amount::text, payment_method, status
        FROM payment_intents WHERE booking_id=$1`, [quotedBooking])).rows;
    expect(intents).toEqual([{ id: expect.any(String), amount: '100000', payment_method: 'wallet', status: 'succeeded' }]);
    expect((await database.query(`SELECT status, escrow_status, payment_method, payment_intent_id, provider_id
        FROM bookings WHERE id=$1`, [quotedBooking])).rows).toEqual([{
      status: 'paid', escrow_status: 'held', payment_method: 'wallet',
      payment_intent_id: intents[0]!.id, provider_id: providerA,
    }]);
    // One wallet debit and one escrow hold of the quoted total.
    expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletA])).rows)
      .toEqual([{ available_balance: '50000' }]);
    expect((await database.query(`SELECT wallet_id, amount::text FROM wallet_transactions
        WHERE booking_id=$1 ORDER BY amount`, [quotedBooking])).rows).toEqual([
      { wallet_id: customerWalletA, amount: '-100000' },
      { wallet_id: escrowWallet, amount: '100000' },
    ]);
    // The authorization terms are appended after the quote's pricing terms,
    // final because the quoting provider is already assigned.
    expect((await database.query(`SELECT fixed_by_event, terms_state, provider_id
        FROM booking_financial_terms WHERE booking_id=$1 ORDER BY version`, [quotedBooking])).rows).toEqual([
      { fixed_by_event: 'quote_accepted', terms_state: 'final', provider_id: providerA },
      { fixed_by_event: 'wallet_payment_authorized', terms_state: 'final', provider_id: providerA },
    ]);
  });
}, 60000);
