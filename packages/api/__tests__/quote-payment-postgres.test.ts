import type { Pool } from 'pg';
import type { Response } from 'supertest';
import { withQuotePaymentDatabase, walletPayHttp, quotedBooking } from './helpers/quote-payment-postgres';
import { waitForWaiters } from './helpers/dispute-postgres';
import {
  bookingIntegrationIt as it, participantSnapshot, customerA, customerB, customerWalletA, providerA,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S1-9 supporting checks (OPS-559 is the bug test). The quoted booking is at
// payment_pending with provider A assigned, its quote's pricing terms recorded
// and its scheduled time two days out; customer A's wallet holds 150,000 and
// the quote totals 100,000.

const ATTEMPT_409 = 'This booking already has a payment attempt. Please contact support to complete it.';

async function balanceA(database: Pool): Promise<string> {
  return (await database.query<{ b: string }>('SELECT available_balance::text AS b FROM wallets WHERE id=$1', [customerWalletA]))
    .rows[0]!.b;
}

// D35 Q10 interim: any earlier payment record blocks the wallet, a failed one
// included, because a failed card or GCash attempt could still complete.
for (const status of ['pending', 'awaiting_payment', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded']) {
  it(`a payment_pending booking with an earlier '${status}' payment record is refused and nothing moves`, async () => {
    await withQuotePaymentDatabase(async database => {
      await database.query(`INSERT INTO payment_intents(booking_id,paymongo_intent_id,amount,payment_method,status)
        VALUES ($1,'pi_synthetic_earlier',100000,'gcash',$2)`, [quotedBooking, status]);
      const before = await participantSnapshot(database);

      const response = await walletPayHttp(customerA)(quotedBooking);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe(ATTEMPT_409);
      expect(await participantSnapshot(database)).toEqual(before);
    });
  }, 60000);
}

it('the earlier-payment check runs under the booking lock: a record written while the payment waits is seen', async () => {
  await withQuotePaymentDatabase(async database => {
    const blocker = await database.connect();
    let blockerOpen = true;
    let tap: Promise<Response> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [quotedBooking]);
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      tap = Promise.resolve(walletPayHttp(customerA)(quotedBooking));
      await waitForWaiters(database, pid, 1);
      // An external attempt is recorded while the wallet payment waits.
      await blocker.query(`INSERT INTO payment_intents(booking_id,paymongo_intent_id,amount,payment_method,status)
        VALUES ($1,'pi_synthetic_racing',100000,'gcash','awaiting_payment')`, [quotedBooking]);
      await blocker.query('COMMIT');
      blockerOpen = false;

      const response = await tap;
      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe(ATTEMPT_409);
      expect(await balanceA(database)).toBe('150000');
      expect((await database.query('SELECT status FROM bookings WHERE id=$1', [quotedBooking])).rows)
        .toEqual([{ status: 'payment_pending' }]);
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK');
      if (tap) await tap.catch(() => undefined);
      blocker.release();
    }
  });
}, 60000);

it('two near-simultaneous wallet payments of one accepted quote charge the customer once', async () => {
  await withQuotePaymentDatabase(async database => {
    const blocker = await database.connect();
    let blockerOpen = true;
    let taps: Array<Promise<Response>> = [];
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [quotedBooking]);
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      const pay = walletPayHttp(customerA);
      taps = [Promise.resolve(pay(quotedBooking)), Promise.resolve(pay(quotedBooking))];
      await waitForWaiters(database, pid, 2);
      await blocker.query('COMMIT');
      blockerOpen = false;

      const outcomes = (await Promise.all(taps)).map(r => `${r.status} ${r.body.error?.message ?? ''}`.trim()).sort();
      expect(outcomes).toEqual(['201', '409 Cannot pay for a booking in "paid" status.']);
      expect((await database.query(`SELECT payment_method, status FROM payment_intents WHERE booking_id=$1`, [quotedBooking])).rows)
        .toEqual([{ payment_method: 'wallet', status: 'succeeded' }]);
      expect(await balanceA(database)).toBe('50000');
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK');
      await Promise.allSettled(taps);
      blocker.release();
    }
  });
}, 60000);

for (const passed of ['2 hours', '1 minute']) {
  it(`an accepted quote whose scheduled time passed ${passed} ago is refused and nothing moves (D35 Q12 interim)`, async () => {
    await withQuotePaymentDatabase(async database => {
      await database.query(`UPDATE bookings SET scheduled_at=NOW() - $2::interval WHERE id=$1`, [quotedBooking, passed]);
      const before = await participantSnapshot(database);

      const response = await walletPayHttp(customerA)(quotedBooking);

      expect(response.status).toBe(409);
      expect(response.body.error.message)
        .toBe('The scheduled time for this booking has passed. Please contact support before paying.');
      expect(await participantSnapshot(database)).toEqual(before);
    });
  }, 60000);
}

for (const providerStatus of ['pending', 'rejected', 'suspended', 'deactivated']) {
  it(`an accepted quote whose provider is '${providerStatus}' is refused and nothing moves (D35 Q12 interim)`, async () => {
    await withQuotePaymentDatabase(async database => {
      await database.query('UPDATE providers SET status=$2 WHERE id=$1', [providerA, providerStatus]);
      const before = await participantSnapshot(database);

      const response = await walletPayHttp(customerA)(quotedBooking);

      expect(response.status).toBe(409);
      expect(response.body.error.message)
        .toBe('The provider for this booking is not available right now. Please contact support before paying.');
      expect(await participantSnapshot(database)).toEqual(before);
    });
  }, 60000);
}

it('a payment_pending booking with no provider and no payment record is paid as before (no provider check applies)', async () => {
  await withQuotePaymentDatabase(async database => {
    // Only older data reaches this state (before OPS-556 a participant could
    // set payment_pending directly). It pays like an instant-pay booking.
    await database.query('UPDATE bookings SET provider_id=NULL WHERE id=$1', [quotedBooking]);

    const response = await walletPayHttp(customerA)(quotedBooking);

    expect(response.status).toBe(201);
    expect((await database.query('SELECT status, escrow_status, provider_id FROM bookings WHERE id=$1', [quotedBooking])).rows)
      .toEqual([{ status: 'paid', escrow_status: 'held', provider_id: null }]);
    expect(await balanceA(database)).toBe('50000');
  }, { pricingTerms: false });
}, 60000);

it('a quote accepted before pricing terms were recorded is paid with terms resolved at payment', async () => {
  await withQuotePaymentDatabase(async database => {
    const response = await walletPayHttp(customerA)(quotedBooking);

    expect(response.status).toBe(201);
    expect(await balanceA(database)).toBe('50000');
    expect((await database.query(`SELECT fixed_by_event, terms_state, provider_id,
        service_price_centavos::text AS price, total_amount_centavos::text AS total
        FROM booking_financial_terms WHERE booking_id=$1 ORDER BY version`, [quotedBooking])).rows).toEqual([{
      fixed_by_event: 'wallet_payment_authorized', terms_state: 'final', provider_id: providerA,
      price: '80000', total: '100000',
    }]);
  }, { pricingTerms: false });
}, 60000);

it('another customer cannot pay an accepted quote that is not theirs', async () => {
  await withQuotePaymentDatabase(async database => {
    const before = await participantSnapshot(database);

    const response = await walletPayHttp(customerB)(quotedBooking);

    expect(response.status).toBe(403);
    expect(await participantSnapshot(database)).toEqual(before);
  });
}, 60000);
