// R-NOT-01 (repair list 2026-10-14, P1): when a customer pays for a booking
// that already has its provider, that provider is told. This is the D38 main
// path: the customer accepts a quote (the winning pro is told "Accepted. You
// get the job once they pay."), then pays from the wallet. Before this fix the
// pro heard nothing after the payment.
//
// The notice is an inbox row plus a push through createPushNotification (so
// the live socket fires too), sent only after the payment transaction
// commits, only when the booking had its provider at payment time, and a
// failed notice never fails the payment. Real HTTP (mounted routers, real
// authentication) on the guarded PostgreSQL request-flow fixture; the only
// stand-in is a local function in place of the Expo push API in the push test.
//
// Guards (plain titles): a payment refused at the debit, and a payment whose
// transaction fails at COMMIT after every payment write ran, send nothing;
// a fixed-price booking with no provider at payment time sends nothing while
// the real offer flow offers it, nor when the offered provider accepts it.
import { bookingIntegrationIt as it, customerWalletA, escrowWallet } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, insertQuote, listenAs, notificationsOf, platformDate,
  waitUntil, customerA, providerA, providerUserA,
} from './helpers/request-flow-postgres';
import { readMigration } from './helpers/request-engine-postgres';
import {
  acceptOfferAs, acceptedQuoteBooking, customerPaidNotices, dayLabel, enableOfferDispatch, failCustomerPaidInbox,
  failPaidBookingAtCommit, paymentState, unmatchedFixedPriceBooking,
} from './helpers/customer-paid-notice-postgres';
import { REALTIME_EVENTS } from '../src/services/realtime-events';
import { logger } from '../src/utils/logger';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function expectedBody(): string {
  // quoteBody(): a morning slot two days out; the request is for Aircon repair.
  return `Ana paid for Aircon repair. The job is confirmed for ${dayLabel(platformDate(2))}, morning (8 AM to 12 PM).`;
}

it('Bug R-NOT-01-A — after a wallet payment the assigned provider gets exactly one customer-paid notice', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await acceptedQuoteBooking(database);

    const paid = await flowHttp(customerA, 'customer').walletPay(bookingId);

    expect(paid.status).toBe(201);
    expect(await customerPaidNotices(database)).toEqual([{
      user_id: providerUserA, title: 'Customer paid', body: expectedBody(), booking_id: bookingId,
    }]);
  });
}, 90000);

it('Bug R-NOT-01-B — the customer-paid notice reaches the provider\'s open app on the live socket', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await acceptedQuoteBooking(database);
    const sockets = await listenAs([{ userId: providerUserA, role: 'provider' }]);
    try {
      const paidNotices = () => sockets.events.get(providerUserA)!
        .filter(e => e.event === REALTIME_EVENTS.NOTIFICATION_NEW)
        .map(e => e.payload as { type: string; title: string; body: string; data: { bookingId?: string } })
        .filter(p => p.type === 'customer_paid');

      expect((await flowHttp(customerA, 'customer').walletPay(bookingId)).status).toBe(201);
      // A missing event is a failure: waitUntil throws after 5 seconds.
      await waitUntil(async () => paidNotices().length > 0, 'the customer_paid socket event');
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(paidNotices().map(p => [p.title, p.body, p.data.bookingId]))
        .toEqual([['Customer paid', expectedBody(), bookingId]]);
    } finally {
      await sockets.close();
    }
  });
}, 90000);

it('Bug R-NOT-01-C — the customer-paid notice is pushed to the provider\'s device under the Booking updates preference', async () => {
  await withRequestFlowDatabase(async database => {
    await database.query(readMigration('016_create_push_tokens.sql'));
    // Booking updates on, System off: the notice must count as a booking update.
    await database.query(`INSERT INTO notification_preferences (user_id, booking_updates, system)
      VALUES ($1, TRUE, FALSE)`, [providerUserA]);
    await database.query(`INSERT INTO push_tokens (user_id, token, platform)
      VALUES ($1, 'ExponentPushToken[synthetic-r-not-01]', 'android')`, [providerUserA]);
    const pushed: Array<{ to: string; title: string; body: string; data: { type: string; bookingId?: string } }> = [];
    const expo = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
      if (url !== EXPO_PUSH_URL) throw new Error(`Unexpected network call to ${String(url)}`);
      const messages = JSON.parse(String(init?.body)) as typeof pushed;
      pushed.push(...messages);
      return { json: async () => ({ data: messages.map(() => ({ status: 'ok' })) }) };
    });
    const fixtureFetch = globalThis.fetch;
    globalThis.fetch = expo as unknown as typeof fetch;
    try {
      const bookingId = await acceptedQuoteBooking(database);
      const paidPushes = () => pushed.filter(m => m.data.type === 'customer_paid');

      expect((await flowHttp(customerA, 'customer').walletPay(bookingId)).status).toBe(201);
      // createPushNotification sends the push in the background.
      await waitUntil(async () => paidPushes().length > 0, 'the customer_paid device push');
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(paidPushes().map(m => [m.to, m.title, m.body, m.data.bookingId])).toEqual([
        ['ExponentPushToken[synthetic-r-not-01]', 'Customer paid', expectedBody(), bookingId],
      ]);
    } finally {
      globalThis.fetch = fixtureFetch;
    }
  });
}, 90000);

it('Bug R-NOT-01-D — a customer-paid notice that fails to save does not fail the wallet payment', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await acceptedQuoteBooking(database);
    await failCustomerPaidInbox(database);
    (logger.error as jest.Mock).mockClear();

    const paid = await flowHttp(customerA, 'customer').walletPay(bookingId);

    expect(paid.status).toBe(201);
    expect(paid.body.data.status).toBe('succeeded');
    // The payment committed in full.
    expect((await database.query('SELECT status, escrow_status, payment_method FROM bookings WHERE id = $1',
      [bookingId])).rows).toEqual([{ status: 'paid', escrow_status: 'held', payment_method: 'wallet' }]);
    expect((await database.query(`SELECT wallet_id, amount::text FROM wallet_transactions
        WHERE booking_id = $1 ORDER BY amount`, [bookingId])).rows).toEqual([
      { wallet_id: customerWalletA, amount: '-100000' },
      { wallet_id: escrowWallet, amount: '100000' },
    ]);
    expect(await customerPaidNotices(database)).toEqual([]);
    // The failure is logged, not hidden.
    expect((logger.error as jest.Mock).mock.calls.filter(([message]) =>
      message === 'Wallet payment: customer-paid notice to the provider failed'))
      .toEqual([[
        'Wallet payment: customer-paid notice to the provider failed',
        expect.objectContaining({ bookingId, error: expect.stringContaining('synthetic inbox outage') }),
      ]]);
  });
}, 90000);

it('Bug R-NOT-01-E — for a quote with no time window the customer-paid notice names the job date and clock time', async () => {
  await withRequestFlowDatabase(async database => {
    // A quote sent before D38 slots: no window, so the job keeps the request's
    // time, here 2:30 PM Manila three days out.
    const bookingId = await insertQuoteRequest(database, {
      status: 'quoted',
      scheduledAtSql: "(date_trunc('day', NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '3 days 14 hours 30 minutes') AT TIME ZONE 'Asia/Manila'",
    });
    const quoteId = await insertQuote(database, { bookingId, providerId: providerA, earliestDayOffset: null });
    const customer = flowHttp(customerA, 'customer');
    expect((await customer.accept(bookingId, quoteId)).status).toBe(200);

    expect((await customer.walletPay(bookingId)).status).toBe(201);

    expect((await customerPaidNotices(database)).map(n => [n.user_id, n.body])).toEqual([[
      providerUserA, `Ana paid for Aircon repair. The job is confirmed for ${dayLabel(platformDate(3))} at 2:30 PM.`,
    ]]);
  });
}, 90000);

it('a wallet payment refused for too small a balance sends no customer-paid notice', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await acceptedQuoteBooking(database);
    // The accepted total is 100,000; the wallet holds less.
    await database.query('UPDATE wallets SET available_balance = 50000 WHERE id = $1', [customerWalletA]);

    const paid = await flowHttp(customerA, 'customer').walletPay(bookingId);

    expect(paid.status).toBe(400);
    expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id = $1', [bookingId])).rows)
      .toEqual([{ status: 'payment_pending', escrow_status: 'pending' }]);
    expect(await customerPaidNotices(database)).toEqual([]);
  });
}, 90000);

it('a wallet payment that fails at commit, after every payment write, sends no customer-paid notice', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await acceptedQuoteBooking(database);
    await failPaidBookingAtCommit(database);
    const before = await paymentState(database, bookingId);
    (logger.error as jest.Mock).mockClear();

    const paid = await flowHttp(customerA, 'customer').walletPay(bookingId);

    expect(paid.status).toBe(500);
    // It failed at the commit, not earlier.
    expect((logger.error as jest.Mock).mock.calls.filter(([message]) => message === 'Request error')
      .map(([, context]) => (context as { error: string }).error)).toEqual(['synthetic commit failure']);
    // The debit, payment record, booking status and escrow hold all rolled back.
    expect(await paymentState(database, bookingId)).toEqual(before);
    expect(before.booking).toEqual([{
      status: 'payment_pending', escrow_status: 'pending', payment_method: null, payment_intent_id: null,
    }]);
    expect(await customerPaidNotices(database)).toEqual([]);
  });
}, 90000);

it('a wallet payment for a booking with no provider yet sends no customer-paid notice while the job is offered', async () => {
  await withRequestFlowDatabase(async database => {
    // A fixed-price booking still waiting for a provider: after payment the
    // real offer flow (dispatchPaidBookingIfNeeded) offers it to provider A.
    await enableOfferDispatch(database);
    const bookingId = await unmatchedFixedPriceBooking(database);

    const paid = await flowHttp(customerA, 'customer').walletPay(bookingId);

    expect(paid.status).toBe(201);
    expect((await database.query('SELECT status, provider_id FROM bookings WHERE id = $1', [bookingId])).rows)
      .toEqual([{ status: 'paid', provider_id: null }]);
    // The offer really went out, and provider A was told about it as a new job.
    expect((await database.query('SELECT provider_id, status FROM booking_offers WHERE booking_id = $1',
      [bookingId])).rows).toEqual([{ provider_id: providerA, status: 'pending' }]);
    expect((await notificationsOf(database, providerUserA)).map(n => n.type)).toEqual(['new_job_available']);
    expect(await customerPaidNotices(database)).toEqual([]);
  });
}, 90000);

it('a provider who accepts the offer for an already paid booking gets no customer-paid notice', async () => {
  await withRequestFlowDatabase(async database => {
    await enableOfferDispatch(database);
    const bookingId = await unmatchedFixedPriceBooking(database);
    expect((await flowHttp(customerA, 'customer').walletPay(bookingId)).status).toBe(201);
    const offer = (await database.query<{ id: string }>(
      `SELECT id FROM booking_offers WHERE booking_id = $1 AND provider_id = $2 AND status = 'pending'`,
      [bookingId, providerA])).rows;
    expect(offer).toHaveLength(1);

    const accepted = await acceptOfferAs(providerUserA, offer[0]!.id);

    expect(accepted.status).toBe(200);
    expect((await database.query('SELECT status, provider_id FROM bookings WHERE id = $1', [bookingId])).rows)
      .toEqual([{ status: 'paid', provider_id: providerA }]);
    expect(await customerPaidNotices(database)).toEqual([]);
  });
}, 90000);
