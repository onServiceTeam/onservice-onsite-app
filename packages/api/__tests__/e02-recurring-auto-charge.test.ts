// E02 / D22 — Recurring auto-charge end-to-end implementation.
//
// Isolated legacy-service coverage retained for historical E02 behavior.
// E20 supersedes launch wiring: Bugs UX-189/190 disable token activation and
// scheduler execution until the money, consent, lifecycle, and reconciliation
// path is redesigned and sandbox-tested. These tests do not claim launch use.
// Covers:
//  1. setAutoChargePaymentMethod — store/replace, idempotent, ownership.
//  2. clearAutoChargePaymentMethod — clear, ownership check.
//  3. attemptAutoCharge:
//     - skips if no payment method
//     - skips if suspended
//     - PayMongo failure increments counter; suspends at threshold
//     - success path: wallet-only, wallet+paymongo, paymongo-only
//     - success resets the failure counter
//     - notifications dispatched (succeeded / failed / suspended)
//     - audit row in recurring_auto_charge_attempts
//  4. listAttempts — returns history.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const createNotificationMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => {
  const actual = jest.requireActual('../src/services/notification.service');
  return {
    ...actual,
    createPushNotification: (...args: unknown[]) => createNotificationMock(...args),
  };
});

// Mock settings.service so getSetting doesn't hit Redis or DB. Default
// the failure threshold to 3 so the test of "at threshold" hits suspension.
const getSettingMock = jest.fn();
jest.mock('../src/services/settings.service', () => ({
  getSetting: (...args: unknown[]) => getSettingMock(...args),
}));

// Mock wallet + escrow + payment services to keep the focus on the
// auto-charge orchestration logic.
const getUserWalletMock = jest.fn();
const debitWalletInTransactionMock = jest.fn();
jest.mock('../src/services/wallet.service', () => ({
  getUserWallet: (...args: unknown[]) => getUserWalletMock(...args),
  debitWalletInTransaction: (...args: unknown[]) => debitWalletInTransactionMock(...args),
}));

const holdInEscrowInTransactionMock = jest.fn();
jest.mock('../src/services/escrow.service', () => ({
  holdInEscrowInTransaction: (...args: unknown[]) => holdInEscrowInTransactionMock(...args),
}));

const createPaymentIntentMock = jest.fn();
jest.mock('../src/services/payment.service', () => ({
  createPaymentIntent: (...args: unknown[]) => createPaymentIntentMock(...args),
}));

// Mock global fetch for PayMongo calls.
const fetchMock = jest.fn();
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchMock;
});

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  createNotificationMock.mockReset().mockResolvedValue(undefined);
  getSettingMock.mockReset().mockResolvedValue('3');
  getUserWalletMock.mockReset();
  debitWalletInTransactionMock.mockReset().mockResolvedValue({});
  holdInEscrowInTransactionMock.mockReset().mockResolvedValue(undefined);
  createPaymentIntentMock.mockReset().mockResolvedValue({});
  fetchMock.mockReset();
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

import {
  setAutoChargePaymentMethod,
  clearAutoChargePaymentMethod,
  attemptAutoCharge,
  listAttempts,
} from '../src/services/recurring-auto-charge.service';

describe('E02 — setAutoChargePaymentMethod', () => {
  it('E02 — writes payment_method_id + label and resets failure state in trx', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'c1',
        payment_method_id: null, payment_method_label: null,
        auto_charge_status: 'failed',
        auto_charge_consecutive_failures: 2,
        auto_charge_suspended_at: null,
        auto_charge: true,
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await setAutoChargePaymentMethod('rb1', 'c1', 'pm_abc', 'Visa ending 4242');

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE recurring_bookings/.test(sql as string),
    );
    expect(updateCall).toBeDefined();
    const params = updateCall![1] as unknown[];
    expect(params[0]).toBe('pm_abc');
    expect(params[1]).toBe('Visa ending 4242');
    expect(updateCall![0]).toMatch(/auto_charge_consecutive_failures = 0/);
    expect(updateCall![0]).toMatch(/auto_charge_suspended_at = NULL/);
  });

  it('E02 — refuses if recurring booking belongs to a different customer', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'OTHER',
        payment_method_id: null, payment_method_label: null,
        auto_charge_status: null, auto_charge_consecutive_failures: 0,
        auto_charge_suspended_at: null, auto_charge: true,
      }],
      rowCount: 1,
    });
    await expect(
      setAutoChargePaymentMethod('rb1', 'c1', 'pm_abc', 'Visa 4242'),
    ).rejects.toThrow(/not found/);
  });

  it('E02 — idempotent if same method + label + not suspended', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'c1',
        payment_method_id: 'pm_abc', payment_method_label: 'Visa 4242',
        auto_charge_status: null, auto_charge_consecutive_failures: 0,
        auto_charge_suspended_at: null, auto_charge: true,
      }],
      rowCount: 1,
    });
    await setAutoChargePaymentMethod('rb1', 'c1', 'pm_abc', 'Visa 4242');
    // No UPDATE call.
    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE recurring_bookings/.test(sql as string),
    );
    expect(updateCall).toBeUndefined();
  });

  it('E02 — rejects empty paymentMethodId', async () => {
    await expect(
      setAutoChargePaymentMethod('rb1', 'c1', '   ', 'Visa 4242'),
    ).rejects.toThrow(/payment method ID is required/);
  });
});

describe('E02 — clearAutoChargePaymentMethod', () => {
  it('E02 — UPDATEs the row and writes nulls; ownership-checked', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ customer_id: 'c1' }], rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await clearAutoChargePaymentMethod('rb1', 'c1');

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE recurring_bookings/.test(sql as string),
    );
    expect(updateCall![0]).toMatch(/payment_method_id = NULL/);
    expect(updateCall![0]).toMatch(/payment_method_label = NULL/);
  });

  it('E02 — refuses on ownership mismatch', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ customer_id: 'OTHER' }], rowCount: 1 });
    await expect(clearAutoChargePaymentMethod('rb1', 'c1')).rejects.toThrow(/not found/);
  });
});

describe('E02 — attemptAutoCharge — skipped paths (no DB writes for ledger)', () => {
  it('E02 — skipped_no_method when payment_method_id is null', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'c1',
        payment_method_id: null, payment_method_label: null,
        auto_charge_status: null, auto_charge_consecutive_failures: 0,
        auto_charge_suspended_at: null, auto_charge: true,
      }],
      rowCount: 1,
    });
    // recordAttempt INSERT
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await attemptAutoCharge({
      recurringBookingId: 'rb1', bookingId: 'b1', customerId: 'c1',
      amountCentavos: 100000, paymentMethodId: null,
      description: 'test',
    });
    expect(out.outcome).toBe('skipped_no_method');
    // No PayMongo call.
    expect(fetchMock).not.toHaveBeenCalled();
    // No customer notification fired (skipped silently — they didn't opt in).
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('E02 — skipped_suspended when auto_charge_suspended_at is set', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'c1',
        payment_method_id: 'pm_abc', payment_method_label: 'Visa',
        auto_charge_status: 'suspended', auto_charge_consecutive_failures: 3,
        auto_charge_suspended_at: '2026-05-01', auto_charge: true,
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await attemptAutoCharge({
      recurringBookingId: 'rb1', bookingId: 'b1', customerId: 'c1',
      amountCentavos: 100000, paymentMethodId: null, description: 'test',
    });
    expect(out.outcome).toBe('skipped_suspended');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('E02 — attemptAutoCharge — PayMongo failure path', () => {
  it('E02 — PayMongo non-2xx → outcome failed, counter incremented, notification fired', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_x';

    // 1. SELECT recurring_bookings
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'c1',
        payment_method_id: 'pm_abc', payment_method_label: 'Visa 4242',
        auto_charge_status: null, auto_charge_consecutive_failures: 1,
        auto_charge_suspended_at: null, auto_charge: true,
      }],
      rowCount: 1,
    });
    // No wallet — getUserWallet throws.
    getUserWalletMock.mockRejectedValueOnce(new Error('no wallet'));
    // PayMongo declines.
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 402,
      text: async () => 'card_declined',
    } as unknown as Response);
    // UPDATE recurring_bookings (failure path, inside trx).
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // recordAttempt INSERT.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await attemptAutoCharge({
      recurringBookingId: 'rb1', bookingId: 'b1', customerId: 'c1',
      amountCentavos: 100000, paymentMethodId: null,
      description: 'test failure',
    });

    expect(out.outcome).toBe('failed');
    expect(out.consecutiveFailuresAfter).toBe(2);
    expect(out.failureReason).toMatch(/PayMongo \/payments returned 402/);

    // Customer was notified.
    expect(createNotificationMock).toHaveBeenCalled();
    const notif = createNotificationMock.mock.calls[0]![0];
    expect(notif.type).toBe('recurring_auto_charge_failed');
  });

  it('E02 — at threshold the row is suspended and recurring_auto_charge_suspended notification fires', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_x';
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'c1',
        payment_method_id: 'pm_abc', payment_method_label: 'Visa',
        auto_charge_status: 'failed', auto_charge_consecutive_failures: 2,
        auto_charge_suspended_at: null, auto_charge: true,
      }],
      rowCount: 1,
    });
    getUserWalletMock.mockRejectedValueOnce(new Error('no wallet'));
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 402, text: async () => 'card_declined',
    } as unknown as Response);
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // attempts insert

    const out = await attemptAutoCharge({
      recurringBookingId: 'rb1', bookingId: 'b1', customerId: 'c1',
      amountCentavos: 100000, paymentMethodId: null, description: 'test',
    });

    expect(out.outcome).toBe('failed');
    expect(out.consecutiveFailuresAfter).toBe(3);
    // Both customer notification AND admin suspended notification.
    const types = createNotificationMock.mock.calls.map((c) => c[0].type);
    expect(types).toContain('recurring_auto_charge_failed');
    expect(types).toContain('recurring_auto_charge_suspended');
  });
});

describe('E02 — attemptAutoCharge — success path', () => {
  it('E02 — wallet covers full amount → wallet-only debit, no PayMongo, succeeded notification', async () => {
    // SELECT recurring_bookings
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'c1',
        payment_method_id: 'pm_abc', payment_method_label: 'Visa',
        auto_charge_status: null, auto_charge_consecutive_failures: 0,
        auto_charge_suspended_at: null, auto_charge: true,
      }],
      rowCount: 1,
    });
    // Wallet has more than enough.
    getUserWalletMock.mockResolvedValueOnce({
      id: 'w1', available_balance: '5000',
    });
    // UPDATE bookings (in trx).
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // UPDATE recurring_bookings reset (in trx).
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // recordAttempt insert.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await attemptAutoCharge({
      recurringBookingId: 'rb1', bookingId: 'b1', customerId: 'c1',
      amountCentavos: 100000, paymentMethodId: null,
      description: 'wallet-only',
    });

    expect(out.outcome).toBe('succeeded');
    expect(out.walletPortion).toBe(100000);
    expect(out.paymongoPortion).toBe(0);
    // No PayMongo HTTP call.
    expect(fetchMock).not.toHaveBeenCalled();
    // Wallet was debited.
    expect(debitWalletInTransactionMock).toHaveBeenCalled();
    // Escrow was held.
    expect(holdInEscrowInTransactionMock).toHaveBeenCalled();
    // Customer notified.
    expect(createNotificationMock).toHaveBeenCalled();
    expect(createNotificationMock.mock.calls[0]![0].type).toBe('recurring_auto_charge_succeeded');
  });

  it('E02 — wallet covers part → wallet partial + PayMongo for remainder', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_x';
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'c1',
        payment_method_id: 'pm_abc', payment_method_label: 'Visa',
        auto_charge_status: null, auto_charge_consecutive_failures: 0,
        auto_charge_suspended_at: null, auto_charge: true,
      }],
      rowCount: 1,
    });
    // Wallet has 300 pesos = 30000 centavos.
    getUserWalletMock.mockResolvedValueOnce({
      id: 'w1', available_balance: '300',
    });
    // PayMongo charge succeeds.
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: { id: 'pay_xyz' } }),
    } as unknown as Response);
    // UPDATE bookings + UPDATE recurring_bookings + recordAttempt.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await attemptAutoCharge({
      recurringBookingId: 'rb1', bookingId: 'b1', customerId: 'c1',
      amountCentavos: 100000, paymentMethodId: null,
      description: 'partial',
    });

    expect(out.outcome).toBe('succeeded');
    expect(out.walletPortion).toBe(30000);
    expect(out.paymongoPortion).toBe(70000);
    expect(out.paymongoPaymentId).toBe('pay_xyz');
    // Wallet debited for 300.00.
    expect(debitWalletInTransactionMock).toHaveBeenCalled();
    expect(debitWalletInTransactionMock.mock.calls[0]![2]).toBe(300);
  });

  it('E02 — success resets consecutive_failures counter to 0', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_x';
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rb1', customer_id: 'c1',
        payment_method_id: 'pm_abc', payment_method_label: 'Visa',
        auto_charge_status: 'failed', auto_charge_consecutive_failures: 2,
        auto_charge_suspended_at: null, auto_charge: true,
      }],
      rowCount: 1,
    });
    getUserWalletMock.mockRejectedValueOnce(new Error('no wallet')); // PayMongo-only path
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: { id: 'pay_xyz' } }),
    } as unknown as Response);
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE bookings
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE recurring reset
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // attempts

    const out = await attemptAutoCharge({
      recurringBookingId: 'rb1', bookingId: 'b1', customerId: 'c1',
      amountCentavos: 100000, paymentMethodId: null, description: 'reset',
    });

    expect(out.outcome).toBe('succeeded');
    expect(out.consecutiveFailuresAfter).toBe(0);
    // Find the UPDATE that reset the counter.
    const resetCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE recurring_bookings[\s\S]*auto_charge_consecutive_failures = 0/.test(sql as string),
    );
    expect(resetCall).toBeDefined();
  });
});

describe('E02 — listAttempts', () => {
  it('E02 — returns history newest-first with mapped fields', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'a1', attempted_at: '2026-05-02', amount_centavos: '100000',
          outcome: 'succeeded', wallet_portion_centavos: '0',
          paymongo_portion_centavos: '100000', failure_reason: null,
          paymongo_payment_id: 'pay_xyz',
        },
      ],
      rowCount: 1,
    });
    const out = await listAttempts('rb1', 10);
    expect(out).toHaveLength(1);
    expect(out[0]!.outcome).toBe('succeeded');
    expect(out[0]!.paymongoPaymentId).toBe('pay_xyz');
    const sql = dbQueryMock.mock.calls[0]![0] as string;
    expect(sql).toMatch(/ORDER BY attempted_at DESC/);
  });
});
