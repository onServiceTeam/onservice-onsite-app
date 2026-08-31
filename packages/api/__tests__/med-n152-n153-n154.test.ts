// MED-N152 / MED-N153 / MED-N154 — rebooking radius + tip wallet-only + promo per-customer.

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
jest.mock('../src/services/wallet.service', () => ({
  getUserWallet: jest.fn().mockResolvedValue({ id: 'w1', available_balance: '0' }),
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingNumber: jest.fn().mockResolvedValue(500000), // ₱5000 max tip
  getSetting: jest.fn().mockResolvedValue('500000'),
  getSettingBoolean: jest.fn().mockResolvedValue(true),
}));

import { sendTip } from '../src/services/tip.service';
import { resolvePromo, recordPromoRedemption } from '../src/services/booking/promo.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REBOOKING_SVC = readFileSync(
  resolve(__dirname, '../src/services/rebooking.service.ts'),
  'utf8',
);

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

describe('MED-N152 — rebooking availableProviders applies Haversine + service_radius_km when coords present', () => {
  it('MED-N152 — rebooking.service has the Haversine SQL branch', () => {
    expect(REBOOKING_SVC).toMatch(/EARTH_RADIUS_KM/);
    expect(REBOOKING_SVC).toMatch(/<= p\.service_radius_km/);
    expect(REBOOKING_SVC).toMatch(/cos\(radians\(/);
  });

  it('MED-N152 — has the legacy ILIKE fallback for bookings without coords', () => {
    expect(REBOOKING_SVC).toMatch(/p\.city ILIKE \$2/);
    expect(REBOOKING_SVC).toMatch(/hasCoords/);
  });
});

describe('MED-N153 — tip restricted to wallet method until v1.1', () => {
  it('MED-N153 — non-wallet method rejected with 400', async () => {
    // SELECT booking. (settings.getSettingNumber is mocked above.)
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'b1', customer_id: 'c1', provider_id: 'p1', status: 'confirmed' }],
      rowCount: 1,
    });
    // SELECT COUNT existing tip = 0.
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

    await expect(
      sendTip('c1', { bookingId: 'b1', amount: 5000, paymentMethod: 'card' }),
    ).rejects.toThrow(/wallet payment only/);
    // No trx opened — service refused before debit.
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it('MED-N153 — wallet method continues to work', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'b1', customer_id: 'c1', provider_id: 'p1', status: 'confirmed' }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    // Wallet has enough.
    const { getUserWallet } = require('../src/services/wallet.service');
    getUserWallet.mockResolvedValueOnce({ id: 'w1', available_balance: '10000' });
    // wallet UPDATE
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // wallet_transactions INSERT
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // tips INSERT
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'tip-1', booking_id: 'b1', customer_id: 'c1', provider_id: 'p1', amount: '5000', payment_method: 'wallet', status: 'completed' }],
      rowCount: 1,
    });
    // SELECT provider user_id
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'pu1' }], rowCount: 1 });
    getUserWallet.mockResolvedValueOnce({ id: 'pw1' });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // provider wallet UPDATE
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // wallet_transactions INSERT
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // notifications INSERT

    const out = await sendTip('c1', { bookingId: 'b1', amount: 5000, paymentMethod: 'wallet' });
    expect(out.id).toBe('tip-1');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  });
});

describe('MED-N154 — resolvePromo enforces per-customer limit', () => {
  it('MED-N154 — at limit throws promo_exhausted', async () => {
    // SELECT promo_codes.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'pc-1', code: 'HALFOFF',
        discount_type: 'percentage', discount_value: 50,
        max_discount_centavos: null, minimum_order_centavos: '0',
        usage_limit_total: null, usage_limit_per_customer: 1, times_used: 0,
        valid_from: new Date('2020-01-01'), valid_until: null, active: true,
      }],
      rowCount: 1,
    });
    // SELECT COUNT promo_redemptions returns 1 (limit = 1).
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });

    await expect(
      resolvePromo({ code: 'HALFOFF', subtotalCents: 100000, userId: 'c1' }),
    ).rejects.toThrow(/promo_exhausted/);
  });

  it('MED-N154 — under limit returns the discount', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'pc-1', code: 'HALFOFF',
        discount_type: 'percentage', discount_value: 50,
        max_discount_centavos: null, minimum_order_centavos: '0',
        usage_limit_total: null, usage_limit_per_customer: 3, times_used: 0,
        valid_from: new Date('2020-01-01'), valid_until: null, active: true,
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });

    const out = await resolvePromo({ code: 'HALFOFF', subtotalCents: 100000, userId: 'c1' });
    expect(out).toBe(50000); // 50% of 100000
  });

  it('MED-N154 — schema-missing (42P01) degrades gracefully (skips check)', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'pc-1', code: 'HALFOFF',
        discount_type: 'percentage', discount_value: 50,
        max_discount_centavos: null, minimum_order_centavos: '0',
        usage_limit_total: null, usage_limit_per_customer: 1, times_used: 0,
        valid_from: new Date('2020-01-01'), valid_until: null, active: true,
      }],
      rowCount: 1,
    });
    dbQueryMock.mockRejectedValueOnce(Object.assign(new Error('table missing'), { code: '42P01' }));

    const out = await resolvePromo({ code: 'HALFOFF', subtotalCents: 100000, userId: 'c1' });
    expect(out).toBe(50000); // 42P01 swallowed; discount returned
  });
});

describe('MED-N154 — recordPromoRedemption helper', () => {
  it('MED-N154 — INSERT with ON CONFLICT DO NOTHING (idempotent on dup)', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    await recordPromoRedemption({ query: queryMock }, {
      promoCodeId: 'pc-1', bookingId: 'b1', customerId: 'c1', discountCentavos: 5000,
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0]![0]).toMatch(/INSERT INTO promo_redemptions/);
    expect(queryMock.mock.calls[0]![0]).toMatch(/ON CONFLICT \(booking_id, promo_code_id\) DO NOTHING/);
  });

  it('MED-N154 — table missing (42P01) is logged and swallowed', async () => {
    const queryMock = jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: '42P01' }));
    await expect(
      recordPromoRedemption({ query: queryMock }, {
        promoCodeId: 'pc-1', bookingId: 'b1', customerId: 'c1', discountCentavos: 5000,
      }),
    ).resolves.toBeUndefined();
  });

  it('MED-N154 — non-42P01 errors propagate', async () => {
    const queryMock = jest.fn().mockRejectedValue(Object.assign(new Error('connection lost'), { code: '08006' }));
    await expect(
      recordPromoRedemption({ query: queryMock }, {
        promoCodeId: 'pc-1', bookingId: 'b1', customerId: 'c1', discountCentavos: 5000,
      }),
    ).rejects.toThrow(/connection lost/);
  });
});
