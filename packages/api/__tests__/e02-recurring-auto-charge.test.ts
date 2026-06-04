// E02 / D22 — Recurring auto-charge end-to-end implementation.
//
// Covers:
//  1. Migration 107 shape (columns, audit table, index, settings row).
//  2. NotificationType union includes the 3 new lifecycle types.
//  3. setAutoChargePaymentMethod — store/replace, idempotent, ownership.
//  4. clearAutoChargePaymentMethod — clear, ownership check.
//  5. attemptAutoCharge:
//     - skips if no payment method
//     - skips if suspended
//     - PayMongo failure increments counter; suspends at threshold
//     - success path: wallet-only, wallet+paymongo, paymongo-only
//     - success resets the failure counter
//     - notifications dispatched (succeeded / failed / suspended)
//     - audit row in recurring_auto_charge_attempts
//  6. Scheduler integration: processRecurringBookings calls
//     attemptAutoCharge ONLY when rb.auto_charge=TRUE.
//  7. listAttempts — returns history.

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
    createNotification: (...args: unknown[]) => createNotificationMock(...args),
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

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  setAutoChargePaymentMethod,
  clearAutoChargePaymentMethod,
  attemptAutoCharge,
  listAttempts,
} from '../src/services/recurring-auto-charge.service';

const MIGRATION_107 = readFileSync(
  resolve(__dirname, '../migrations/107_recurring_auto_charge_e02.sql'),
  'utf8',
);
const NOTIFICATION_SVC = readFileSync(
  resolve(__dirname, '../src/services/notification.service.ts'),
  'utf8',
);
const RECURRING_SVC = readFileSync(
  resolve(__dirname, '../src/services/recurring.service.ts'),
  'utf8',
);

describe('E02 — migration 107 shape', () => {
  it('E02 — adds payment_method_id column on recurring_bookings', () => {
    expect(MIGRATION_107).toMatch(/ADD COLUMN payment_method_id TEXT NULL/);
  });

  it('E02 — adds payment_method_label column', () => {
    expect(MIGRATION_107).toMatch(/ADD COLUMN payment_method_label TEXT NULL/);
  });

  it('E02 — adds auto_charge_status with CHECK', () => {
    expect(MIGRATION_107).toMatch(/auto_charge_status TEXT NULL/);
    expect(MIGRATION_107).toMatch(/'pending', 'succeeded', 'failed', 'suspended'/);
  });

  it('E02 — adds consecutive_failures, suspended_at, last_attempt_at', () => {
    expect(MIGRATION_107).toMatch(/auto_charge_consecutive_failures INT NOT NULL DEFAULT 0/);
    expect(MIGRATION_107).toMatch(/auto_charge_suspended_at TIMESTAMPTZ NULL/);
    expect(MIGRATION_107).toMatch(/auto_charge_last_attempt_at TIMESTAMPTZ NULL/);
  });

  it('E02 — creates partial index for scheduler hot path', () => {
    expect(MIGRATION_107).toMatch(/idx_recurring_bookings_autocharge_due/);
    expect(MIGRATION_107).toMatch(/WHERE auto_charge = TRUE[\s\S]*payment_method_id IS NOT NULL/);
  });

  it('E02 — creates audit table recurring_auto_charge_attempts', () => {
    expect(MIGRATION_107).toMatch(/CREATE TABLE IF NOT EXISTS recurring_auto_charge_attempts/);
    expect(MIGRATION_107).toMatch(/wallet_portion_centavos BIGINT/);
    expect(MIGRATION_107).toMatch(/paymongo_portion_centavos BIGINT/);
    expect(MIGRATION_107).toMatch(/outcome TEXT NOT NULL CHECK \(outcome IN/);
  });

  it('E02 — inserts platform_setting for failure threshold', () => {
    expect(MIGRATION_107).toMatch(/recurring_auto_charge_max_consecutive_failures/);
  });
});

describe('E02 — NotificationType union extended', () => {
  it('E02 — includes recurring_auto_charge_succeeded', () => {
    expect(NOTIFICATION_SVC).toMatch(/'recurring_auto_charge_succeeded'/);
  });
  it('E02 — includes recurring_auto_charge_failed', () => {
    expect(NOTIFICATION_SVC).toMatch(/'recurring_auto_charge_failed'/);
  });
  it('E02 — includes recurring_auto_charge_suspended', () => {
    expect(NOTIFICATION_SVC).toMatch(/'recurring_auto_charge_suspended'/);
  });
});

describe('E02 — recurring scheduler integration', () => {
  it('E02 — processRecurringBookings imports the auto-charge service', () => {
    expect(RECURRING_SVC).toMatch(/import \* as autoChargeService from '\.\/recurring-auto-charge\.service'/);
  });

  it('E02 — scheduler calls attemptAutoCharge only when rb.auto_charge is true', () => {
    // The branch lives inside processRecurringBookings.
    const procStart = RECURRING_SVC.indexOf('export async function processRecurringBookings');
    expect(procStart).toBeGreaterThan(0);
    const procBlock = RECURRING_SVC.slice(procStart, procStart + 9000);
    expect(procBlock).toMatch(/if \(rb\.auto_charge\)/);
    expect(procBlock).toMatch(/autoChargeService\.attemptAutoCharge/);
  });

  it('E02 — scheduler suppresses generic recurring_update notification on auto-charge success', () => {
    const procStart = RECURRING_SVC.indexOf('export async function processRecurringBookings');
    const procBlock = RECURRING_SVC.slice(procStart, procStart + 9000);
    // "if (!autoChargeSucceeded) { ... type: 'recurring_update' ..."
    expect(procBlock).toMatch(/if \(!autoChargeSucceeded\)[\s\S]*?'recurring_update'/);
  });

  it('E02 — formatRecurringBooking exposes autoChargeStatus + paymentMethodLabel', () => {
    expect(RECURRING_SVC).toMatch(/autoChargeStatus:\s*rb\.auto_charge_status/);
    expect(RECURRING_SVC).toMatch(/paymentMethodLabel:\s*rb\.payment_method_label/);
  });
});

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

describe('E02 — routes wired', () => {
  const ROUTES = readFileSync(
    resolve(__dirname, '../src/routes/recurring.routes.ts'),
    'utf8',
  );

  it('E02 — PUT /:id/auto-charge wired', () => {
    expect(ROUTES).toMatch(/router\.put\([\s\S]*?'\/:id\/auto-charge'/);
  });

  it('E02 — DELETE /:id/auto-charge wired', () => {
    expect(ROUTES).toMatch(/router\.delete\([\s\S]*?'\/:id\/auto-charge'/);
  });

  it('E02 — GET /:id/auto-charge/attempts wired', () => {
    expect(ROUTES).toMatch(/router\.get\([\s\S]*?'\/:id\/auto-charge\/attempts'/);
  });

  it('E02 — PUT validates both paymentMethodId and paymentMethodLabel are required', () => {
    expect(ROUTES).toMatch(/paymentMethodId is required/);
    expect(ROUTES).toMatch(/paymentMethodLabel is required/);
  });
});
