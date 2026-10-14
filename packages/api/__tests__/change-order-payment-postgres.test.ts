import type { Pool, PoolClient } from 'pg';
import * as escrowService from '../src/services/escrow.service';
import * as financialTermsService from '../src/services/booking-financial-terms.service';
import { expireApprovedChangeOrders } from '../src/services/booking.service';
import { waitForWaiters } from './helpers/dispute-postgres';
import { heldFor, bystanderBooking, bystanderHeld } from './helpers/money-dispute-postgres';
import {
  withChangeOrderDatabase, changeOrderHttp, approvedChangeOrder, customerWalletBalance, changeOrderSnapshot,
} from './helpers/change-order-postgres';
import {
  bookingIntegrationIt as it, participantHttp, bookingB, customerB, customerWalletB, escrowWallet, providerUserB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// R-MON-04 evidence (S2-4). Paying an approved change order from the wallet
// is already one transaction; these tests prove it against a real database
// and are proved in turn by the mutations in the slice record. There is no
// defect here, so the titles are not "Bug" titles.
//
// Booking B: service price 800,000, fee 200,000 (25%), total 1,000,000. A
// change order of 200,000 makes the price 1,000,000 and the fee 250,000, so
// the customer pays 250,000 more and the total becomes 1,250,000.

async function bookingMoney(database: Pool) {
  return (await database.query(`SELECT service_price::text, service_fee::text, total_amount::text, escrow_status
    FROM bookings WHERE id=$1`, [bookingB])).rows[0];
}

async function latestTerms(database: Pool) {
  return (await database.query(`SELECT fixed_by_event, source_event_id, service_price_centavos::text,
      service_fee_amount_centavos::text, total_amount_centavos::text
    FROM booking_financial_terms WHERE booking_id=$1 ORDER BY version DESC LIMIT 1`, [bookingB])).rows[0];
}

async function changeOrderStatus(database: Pool, id: string): Promise<string> {
  return (await database.query<{ status: string }>('SELECT status FROM change_orders WHERE id=$1', [id])).rows[0]!.status;
}

async function walletByType(database: Pool, type: string, userId: string | null = null): Promise<number> {
  return Number((await database.query<{ b: string }>(`SELECT COALESCE(SUM(available_balance),0)::text AS b
    FROM wallets WHERE type=$1 AND ($2::uuid IS NULL OR user_id=$2)`, [type, userId])).rows[0]!.b);
}

// Holds a row lock in its own transaction until release() is called.
async function lockRow(database: Pool, sql: string, params: unknown[]): Promise<{ pid: number; release: () => Promise<void>; client: PoolClient }> {
  const client = await database.connect();
  await client.query('BEGIN');
  await client.query(sql, params);
  const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
  let open = true;
  return {
    pid, client,
    release: async () => {
      if (open) { open = false; await client.query('COMMIT'); }
      client.release();
    },
  };
}

it('R-MON-04 - paying a change order from the wallet moves the money, the price and the terms together', async () => {
  await withChangeOrderDatabase(async database => {
    const { id, additionalTotal } = await approvedChangeOrder(200000);
    expect(additionalTotal).toBe(250000);
    expect(await customerWalletBalance(database)).toBe(1000000);
    expect(await heldFor(database, bookingB)).toBe(1000000);

    const paid = await changeOrderHttp().pay(id);

    expect(paid.status).toBe(200);
    expect(paid.body.data).toMatchObject({ changeOrderId: id, bookingId: bookingB, additionalAmountPaid: 250000 });
    expect({
      changeOrder: await changeOrderStatus(database, id),
      wallet: await customerWalletBalance(database),
      held: await heldFor(database, bookingB),
      booking: await bookingMoney(database),
      terms: await latestTerms(database),
      customerLedger: (await database.query(`SELECT type, amount::text, reference_id FROM wallet_transactions
        WHERE wallet_id=$1 AND reference_id=$2`, [customerWalletB, id])).rows,
      escrowRows: (await database.query(`SELECT type, amount::text FROM wallet_transactions
        WHERE wallet_id=$1 AND booking_id=$2 ORDER BY created_at, id`, [escrowWallet, bookingB])).rows,
      bystander: await heldFor(database, bystanderBooking),
    }).toEqual({
      changeOrder: 'paid',
      wallet: 750000,
      held: 1250000,
      booking: { service_price: '1000000', service_fee: '250000', total_amount: '1250000', escrow_status: 'held' },
      terms: {
        fixed_by_event: 'change_order_authorized', source_event_id: id,
        service_price_centavos: '1000000', service_fee_amount_centavos: '250000', total_amount_centavos: '1250000',
      },
      customerLedger: [{ type: 'payment', amount: '-250000', reference_id: id }],
      escrowRows: [{ type: 'escrow_hold', amount: '1000000' }, { type: 'escrow_hold', amount: '250000' }],
      bystander: bystanderHeld,
    });
  });
}, 60000);

it('R-MON-04 - a failure while holding the change-order money leaves everything as it was', async () => {
  await withChangeOrderDatabase(async database => {
    const { id } = await approvedChangeOrder(200000);
    const before = await changeOrderSnapshot(database);
    const hold = jest.spyOn(escrowService, 'holdInEscrowInTransaction')
      .mockRejectedValueOnce(new Error('Synthetic escrow hold failure'));
    try {
      const paid = await changeOrderHttp().pay(id);
      expect(paid.status).toBe(500);
      expect(hold).toHaveBeenCalledTimes(1);
    } finally {
      hold.mockRestore();
    }
    expect(await changeOrderSnapshot(database)).toEqual(before);
  });
}, 60000);

it('R-MON-04 - a failure while recording the change-order terms leaves everything as it was', async () => {
  await withChangeOrderDatabase(async database => {
    const { id } = await approvedChangeOrder(200000);
    const before = await changeOrderSnapshot(database);
    const terms = jest.spyOn(financialTermsService, 'appendAmendedTermsInTransaction')
      .mockRejectedValueOnce(new Error('Synthetic terms failure'));
    try {
      const paid = await changeOrderHttp().pay(id);
      expect(paid.status).toBe(500);
      expect(terms).toHaveBeenCalledTimes(1);
    } finally {
      terms.mockRestore();
    }
    expect(await changeOrderSnapshot(database)).toEqual(before);
  });
}, 60000);

// The wallet debit is two statements: the balance update and its ledger row.
// A trigger in the test schema makes one of them fail and counts the refusal
// in a sequence, which keeps its count when the transaction rolls back. Each
// statement is made to fail in turn, because a statement moved out of the
// transaction only shows when it, or one after it, fails.
const debitFailures = {
  balance: `BEFORE UPDATE ON wallets FOR EACH ROW
    WHEN (OLD.type = 'customer' AND NEW.available_balance < OLD.available_balance)`,
  ledger: "BEFORE INSERT ON wallet_transactions FOR EACH ROW WHEN (NEW.type = 'payment')",
};

it('R-MON-04 - a failure while taking the change-order money from the wallet leaves everything as it was', async () => {
  for (const step of ['balance', 'ledger'] as const) {
    await withChangeOrderDatabase(async database => {
      const { id } = await approvedChangeOrder(200000);
      const before = await changeOrderSnapshot(database);
      await database.query(`CREATE SEQUENCE refused_debits;
        CREATE FUNCTION refuse_debit() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN PERFORM nextval('refused_debits'); RAISE EXCEPTION 'Synthetic wallet debit failure'; END $$;
        CREATE TRIGGER refuse_debit ${debitFailures[step]} EXECUTE FUNCTION refuse_debit()`);

      const paid = await changeOrderHttp().pay(id);

      expect({
        step,
        status: paid.status,
        refusals: (await database.query('SELECT last_value::int AS n FROM refused_debits WHERE is_called')).rows,
      }).toEqual({ step, status: 500, refusals: [{ n: 1 }] });
      expect(await changeOrderSnapshot(database)).toEqual(before);
    });
  }
}, 120000);

// A blocker holds booking B's row; both payments start and wait, then it
// lets go. The second must find the change order already paid.
it('R-MON-04 - two payments of one change order at the same moment take the money once', async () => {
  await withChangeOrderDatabase(async database => {
    const { id } = await approvedChangeOrder(200000);
    const blocker = await lockRow(database, 'SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [bookingB]);
    const running: Array<Promise<number>> = [];
    try {
      const http = changeOrderHttp();
      for (let i = 0; i < 2; i += 1) {
        running.push(http.pay(id).then(response => response.status));
        await waitForWaiters(database, blocker.pid, i + 1);
      }
    } finally {
      await blocker.release();
    }
    expect((await Promise.all(running)).sort()).toEqual([200, 404]);
    expect({
      wallet: await customerWalletBalance(database),
      held: await heldFor(database, bookingB),
      total: (await bookingMoney(database))!.total_amount,
      changeOrderTerms: (await database.query(`SELECT COUNT(*)::int AS n FROM booking_financial_terms
        WHERE booking_id=$1 AND fixed_by_event='change_order_authorized'`, [bookingB])).rows[0].n,
    }).toEqual({ wallet: 750000, held: 1250000, total: '1250000', changeOrderTerms: 1 });
  });
}, 60000);

// The approval is 25 hours old, past the 24-hour default. A blocker holds
// the change order's row; the payment and the expiry worker both wait on
// it, in a fixed order, then it lets go. Whichever was first wins and the
// other changes nothing. Both orders are run.
it('R-MON-04 - a change order that expires while it is being paid ends one way only', async () => {
  for (const first of ['pay', 'expire'] as const) {
    await withChangeOrderDatabase(async database => {
      const { id } = await approvedChangeOrder(200000);
      await database.query("UPDATE change_orders SET customer_responded_at=NOW() - INTERVAL '25 hours' WHERE id=$1", [id]);
      const before = await changeOrderSnapshot(database);
      const blocker = await lockRow(database, 'SELECT id FROM change_orders WHERE id=$1 FOR UPDATE', [id]);
      const http = changeOrderHttp();
      let pay: Promise<number> | undefined;
      let expire: Promise<number> | undefined;
      try {
        if (first === 'pay') {
          pay = http.pay(id).then(response => response.status);
          await waitForWaiters(database, blocker.pid, 1);
          expire = expireApprovedChangeOrders();
        } else {
          expire = expireApprovedChangeOrders();
          await waitForWaiters(database, blocker.pid, 1);
          pay = http.pay(id).then(response => response.status);
        }
        await waitForWaiters(database, blocker.pid, 2);
      } finally {
        await blocker.release();
      }
      const outcome = { pay: await pay, expired: await expire, status: await changeOrderStatus(database, id) };
      if (first === 'pay') {
        expect(outcome).toEqual({ pay: 200, expired: 0, status: 'paid' });
        expect(await customerWalletBalance(database)).toBe(750000);
        expect(await heldFor(database, bookingB)).toBe(1250000);
      } else {
        expect(outcome).toEqual({ pay: 404, expired: 1, status: 'expired' });
        const after = await changeOrderSnapshot(database);
        // Only the change order's status and the two expiry notices changed.
        expect({ ...after, changeOrders: [], notifications: [] }).toEqual({ ...before, changeOrders: [], notifications: [] });
        expect(after.notifications.map(row => row.type)).toEqual(['change_order_expired', 'change_order_expired']);
      }
    });
  }
}, 120000);

// Booking B is marked complete directly (the provider's completion step has
// its own evidence checks, which are not under test here), then customer B
// confirms over HTTP.
it('R-MON-04 - confirming a job after a paid change order pays out the amended total', async () => {
  await withChangeOrderDatabase(async database => {
    const { id } = await approvedChangeOrder(200000);
    expect((await changeOrderHttp().pay(id)).status).toBe(200);
    await database.query(`UPDATE bookings SET status='completed_by_provider', completed_at=NOW() - INTERVAL '1 hour'
      WHERE id=$1`, [bookingB]);

    const confirmed = await participantHttp(customerB, 'customer')(bookingB, 'confirmed');

    expect(confirmed.status).toBe(200);
    const provider = await walletByType(database, 'provider', providerUserB);
    const revenue = await walletByType(database, 'platform_revenue');
    const guarantee = await walletByType(database, 'guarantee_fund');
    expect({
      held: await heldFor(database, bookingB),
      label: (await bookingMoney(database))!.escrow_status,
      paidOut: provider + revenue + guarantee,
      // The provider keeps 85% of the amended 1,000,000 price.
      provider,
      bystander: await heldFor(database, bystanderBooking),
    }).toEqual({ held: 0, label: 'released', paidOut: 1250000, provider: 850000, bystander: bystanderHeld });
  });
}, 60000);
