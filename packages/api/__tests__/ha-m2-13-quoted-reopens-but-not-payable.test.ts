// HA-M2-13 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// a quote request may move from quoted back to requested (the request reopens
// when no live quote is left), but the wallet still refuses to pay a quoted
// request with 409. The wallet asks canTransition(status, 'payment_pending'),
// so this pins that quoted -> payment_pending was NOT added. Real HTTP through
// the mounted payment router on the guarded PostgreSQL fixture. The booking
// carries a non-zero total so that the state machine is the only thing
// between the customer and a charge.
import {
  bookingIntegrationIt as it, customerA, customerWalletA, providerA,
} from './helpers/booking-participant-postgres';
import { marketplaceHttp, quoteService, requestCategory } from './helpers/job-request-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { canTransition } from '../src/types/booking.types';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const quotedRequest = '83000000-0000-4000-8000-000000000131';

it('HA-M2-13: quoted -> requested is allowed, and wallet payment on a quoted request is still 409', async () => {
  expect(canTransition('quoted', 'requested')).toBe(true);

  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id,
        description, service_price, service_fee, total_amount, scheduled_at)
      VALUES ($1, $2, 'quote_based', 'quoted', $3, $4, 'Aircon leaks onto the bed', 80000, 0, 80000,
        NOW() + INTERVAL '2 days')`, [quotedRequest, customerA, requestCategory, quoteService]);
    await database.query(`INSERT INTO booking_quotes (booking_id, provider_id, quoted_price, status, expires_at)
      VALUES ($1, $2, 80000, 'submitted', NOW() + INTERVAL '1 day')`, [quotedRequest, providerA]);
    const money = async () => ({
      wallet: (await database.query('SELECT available_balance FROM wallets WHERE id = $1', [customerWalletA])).rows,
      intents: (await database.query('SELECT id FROM payment_intents WHERE booking_id = $1', [quotedRequest])).rows,
      booking: (await database.query('SELECT status, escrow_status, payment_method FROM bookings WHERE id = $1',
        [quotedRequest])).rows,
    });
    const before = await money();

    const response = await marketplaceHttp(customerA, 'customer').walletPay(quotedRequest);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('Cannot pay for a booking in "quoted" status.');
    expect(await money()).toEqual(before);
    expect(before.booking).toEqual([{ status: 'quoted', escrow_status: 'pending', payment_method: null }]);
  });
}, 90000);
