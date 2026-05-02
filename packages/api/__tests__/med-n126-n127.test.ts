// MED-N126 / MED-N127 — suki tier admin-tunable + redemption rate semantics.

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

const getSettingMock = jest.fn();
jest.mock('../src/services/settings.service', () => ({
  getSetting: (...args: unknown[]) => getSettingMock(...args),
}));

import { redeemPoints, calculateSukiDiscountForBooking, getSukiTiersAsync } from '../src/services/suki.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUKI_SVC = readFileSync(
  resolve(__dirname, '../src/services/suki.service.ts'),
  'utf8',
);

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  getSettingMock.mockReset();
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

describe('MED-N126 — suki tiers loadable from platform_settings', () => {
  it('MED-N126 — loadSukiTiers / getSukiTiersAsync reads from settings', async () => {
    getSettingMock.mockResolvedValueOnce(
      JSON.stringify({
        new: { minBookings: 0, pointsPerPeso: 1, discount: 0 },
        regular: { minBookings: 5, pointsPerPeso: 1, discount: 2 },
        suki: { minBookings: 20, pointsPerPeso: 2, discount: 8 },
        super_suki: { minBookings: 50, pointsPerPeso: 3, discount: 15 },
      }),
    );
    const out = await getSukiTiersAsync();
    expect(out.regular!.discount).toBe(2);
    expect(out.suki!.minBookings).toBe(20);
    expect(out.super_suki!.discount).toBe(15);
    expect(getSettingMock).toHaveBeenCalledWith('suki_tiers');
  });

  it('MED-N126 — falls back to platformConfig.sukiTiers when setting unreadable', async () => {
    getSettingMock.mockRejectedValueOnce(new Error('not found'));
    const out = await getSukiTiersAsync();
    // platformConfig defaults: super_suki minBookings = 25
    expect(out.super_suki!.minBookings).toBe(25);
  });

  it('MED-N126 — calculateSukiDiscountForBooking uses admin-tuned tiers', async () => {
    // Customer's tier from DB.
    dbQueryMock.mockResolvedValueOnce({ rows: [{ tier: 'regular' }], rowCount: 1 });
    // Admin override: regular = 7% discount.
    getSettingMock.mockResolvedValueOnce(
      JSON.stringify({
        new: { minBookings: 0, pointsPerPeso: 1, discount: 0 },
        regular: { minBookings: 5, pointsPerPeso: 1, discount: 7 },
        suki: { minBookings: 20, pointsPerPeso: 2, discount: 8 },
        super_suki: { minBookings: 50, pointsPerPeso: 3, discount: 15 },
      }),
    );
    const out = await calculateSukiDiscountForBooking('c1', 'p1', 100000);
    expect(out.discountPercent).toBe(7);
    expect(out.discountAmount).toBe(7000);
  });
});

describe('MED-N127 — redeemPoints uses admin-tunable points-to-peso conversion', () => {
  it('MED-N127 — default rate (100 points = ₱1) — 1000 points → ₱10 wallet credit', async () => {
    // SELECT membership.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'm1', customer_id: 'c1', provider_id: 'p1',
        points_balance: 1000, total_bookings: 5, total_spent: '5000',
        tier: 'regular', last_booking_at: null, created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });
    // points_to_peso_rate = 100 (default).
    getSettingMock.mockRejectedValueOnce(new Error('not set'));
    // UPDATE membership debit.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT suki_rewards reward row.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // SELECT wallet.
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'w1' }], rowCount: 1 });
    // UPDATE wallet credit.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT wallet_transactions.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // SELECT membership for return.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'm1', customer_id: 'c1', provider_id: 'p1',
        points_balance: 0, total_bookings: 5, total_spent: '5000',
        tier: 'regular', last_booking_at: null, created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });

    const out = await redeemPoints('c1', 'm1', 1000);
    expect(out.amountCredited).toBe(10);
    expect(out.remainingPoints).toBe(0);

    const walletUpdateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE wallets SET available_balance/.test(sql as string),
    );
    expect(walletUpdateCall).toBeDefined();
    expect((walletUpdateCall![1] as unknown[])[0]).toBe(10);
  });

  it('MED-N127 — admin-tuned rate (1000 points = ₱1) → 1000 points → ₱1', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'm1', customer_id: 'c1', provider_id: 'p1',
        points_balance: 1000, total_bookings: 5, total_spent: '5000',
        tier: 'regular', last_booking_at: null, created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });
    getSettingMock.mockResolvedValueOnce('1000'); // 1000 points = ₱1
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'w1' }], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'm1', customer_id: 'c1', provider_id: 'p1',
        points_balance: 0, total_bookings: 5, total_spent: '5000',
        tier: 'regular', last_booking_at: null, created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });

    const out = await redeemPoints('c1', 'm1', 1000);
    expect(out.amountCredited).toBe(1);
  });

  it('MED-N127 — rejects points below the redemption-multiple', async () => {
    await expect(redeemPoints('c1', 'm1', 50)).rejects.toThrow(/multiple of 100/);
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('MED-N127 — rejects insufficient balance', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'm1', customer_id: 'c1', provider_id: 'p1',
        points_balance: 50, total_bookings: 1, total_spent: '500',
        tier: 'new', last_booking_at: null, created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });
    await expect(redeemPoints('c1', 'm1', 100)).rejects.toThrow(/Insufficient/);
  });
});

describe('MED-N126/N127 — source shape', () => {
  it('MED-N126 — loadSukiTiers helper exists and reads from settings', () => {
    expect(SUKI_SVC).toMatch(/async function loadSukiTiers/);
    expect(SUKI_SVC).toMatch(/settingsService\.getSetting\('suki_tiers'\)/);
  });

  it('MED-N127 — loadPointsToPesoRate helper exists with default 100', () => {
    expect(SUKI_SVC).toMatch(/async function loadPointsToPesoRate/);
    expect(SUKI_SVC).toMatch(/settingsService\.getSetting\('suki_points_to_peso_rate'\)/);
    expect(SUKI_SVC).toMatch(/return 100;/);
  });

  it('MED-N127 — amountCredited divides points by the configured rate', () => {
    expect(SUKI_SVC).toMatch(/const amountCredited = points \/ pointsToPesoRate/);
  });
});
