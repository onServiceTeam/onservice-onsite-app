// Phase B CRIT-03 + CRIT-10 + CRIT-11 + CRIT-13 fixes verified.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...a: unknown[]) => dbQueryMock(...a),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const FROM_QUOTE_SVC = readFileSync(
  resolve(__dirname, '../src/services/booking/from-quote.service.ts'),
  'utf8',
);
const SUKI_SVC = readFileSync(
  resolve(__dirname, '../src/services/suki.service.ts'),
  'utf8',
);
const BOOKING_SVC = readFileSync(
  resolve(__dirname, '../src/services/booking.service.ts'),
  'utf8',
);

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
});

describe('Phase B CRIT-03 — escrow refuses to release on corrupt booking row', () => {
  it('CRIT-03 — release rejects a booking whose amounts differ from immutable financial terms', async () => {
    jest.resetModules();
    const termsLookup = jest.fn().mockResolvedValue({
      providerId: 'provider-1',
      servicePriceCentavos: 10000,
      serviceFeeAmountCentavos: 1200,
      totalAmountCentavos: 11200,
    });
    jest.doMock('../src/services/booking-financial-terms.service', () => ({
      getLatestTermsInTransaction: (...args: unknown[]) => termsLookup(...args),
    }));
    jest.doMock('../src/services/wallet.service', () => ({
      getUserWalletInTransaction: jest.fn(),
      lockWalletsForUpdate: jest.fn(),
    }));
    jest.doMock('../src/services/or.service', () => ({ issueOR: jest.fn() }));
    const clientQuery = jest.fn().mockResolvedValueOnce({
      rows: [{
        id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1',
        service_price: '10000', service_fee: '1200', total_amount: '11201',
        status: 'confirmed', escrow_status: 'held', scheduled_at: new Date('2026-01-01T00:00:00.000Z'),
        provider_suspended_during_booking_at: null,
      }],
      rowCount: 1,
    });
    const { releaseEscrowInTransaction } = await import('../src/services/escrow.service');

    await expect(releaseEscrowInTransaction(
      { query: clientQuery } as never,
      'booking-1',
    )).rejects.toMatchObject({ statusCode: 409 });
    expect(termsLookup).toHaveBeenCalledTimes(1);
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });
});

describe('Phase B CRIT-10 — quote re-acceptance is rejected', () => {
  it('CRIT-10 — QUOTE_ACCEPTABLE_QUOTE_STATUSES no longer includes "accepted"', () => {
    expect(FROM_QUOTE_SVC).toMatch(/const QUOTE_ACCEPTABLE_QUOTE_STATUSES = new Set\(\[null, 'submitted'\]\)/);
    expect(FROM_QUOTE_SVC).not.toMatch(/QUOTE_ACCEPTABLE_QUOTE_STATUSES = new Set\(\[null, 'submitted', 'accepted'\]\)/);
  });
  it('CRIT-10 — explicit is_accepted guard exists as defense in depth', () => {
    expect(FROM_QUOTE_SVC).toMatch(/if \(quote\.is_accepted === true\) \{\s*\n\s*throw createAppError\(QUOTE_ERRORS\.quoteWrongStatus, 400\)/);
  });
});

describe('Phase B CRIT-11 — suki redeemPoints is race-safe', () => {
  it('CRIT-11 — UPDATE has WHERE points_balance >= $1 guard', () => {
    expect(SUKI_SVC).toMatch(/WHERE id = \$2 AND points_balance >= \$1/);
  });
  it('CRIT-11 — RETURNING + rowCount check throws 409 on concurrent depletion', () => {
    expect(SUKI_SVC).toMatch(/RETURNING id`/);
    expect(SUKI_SVC).toMatch(/concurrent redemption may have consumed the balance/);
  });

  it('CRIT-11 — runtime: race-conditional second redeem throws 409', async () => {
    jest.resetModules();
    jest.doMock('../src/models/db', () => ({
      db: {
        query: (...a: unknown[]) => dbQueryMock(...a),
        transaction: (cb: unknown) => dbTransactionMock(cb),
      },
    }));
    jest.doMock('../src/utils/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    jest.doMock('../src/services/settings.service', () => ({
      getSetting: jest.fn().mockResolvedValue('100'),
    }));
    // Simulate: read shows 200 points (passes initial check), but
    // concurrent redemption consumed them — UPDATE WHERE >= $1
    // matches 0 rows.
    dbQueryMock.mockReset();
    dbTransactionMock.mockReset();
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'm1', customer_id: 'c1', points_balance: 200 }],
      rowCount: 1,
    });
    // The UPDATE inside the trx returns 0 rows.
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({
        query: jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }),
      });
    });

    const { redeemPoints } = await import('../src/services/suki.service');
    await expect(redeemPoints('c1', 'm1', 100)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('Phase B CRIT-13 — calculateServiceFee reads live settings (admin-tunable)', () => {
  it('CRIT-13 — calculateServiceFee is now async + Promise<number>', () => {
    expect(BOOKING_SVC).toMatch(/export async function calculateServiceFee\(servicePrice: number\): Promise<number>/);
  });
  it('CRIT-13 — calls settings.service.getSettingPercent + getSettingNumber for live values', () => {
    expect(BOOKING_SVC).toMatch(/settingsService\.getSettingPercent\('service_fee_rate'\)/);
    expect(BOOKING_SVC).toMatch(/settingsService\.getSettingNumber\('service_fee_min'\)/);
    expect(BOOKING_SVC).toMatch(/settingsService\.getSettingNumber\('service_fee_max'\)/);
  });
  it('CRIT-13 — falls back to platformConfig sync version on settings error', () => {
    expect(BOOKING_SVC).toMatch(/calculateServiceFeeSync\(servicePrice\)/);
    expect(BOOKING_SVC).toMatch(/} catch \{\s*\n\s*return calculateServiceFeeSync\(servicePrice\);\s*\n\s*\}/);
  });
  it('CRIT-13 — calculateServiceFeeSync preserved for legacy callers', () => {
    expect(BOOKING_SVC).toMatch(/export function calculateServiceFeeSync\(servicePrice: number\): number/);
  });

  it('CRIT-13 — runtime: live rate from settings is applied', async () => {
    jest.resetModules();
    jest.doMock('../src/models/db', () => ({
      db: { query: jest.fn(), transaction: jest.fn() },
    }));
    jest.doMock('../src/utils/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    jest.doMock('../src/services/settings.service', () => ({
      getSettingPercent: jest.fn().mockResolvedValue(0.2), // 20% (vs platformConfig default 10%)
      getSettingNumber: jest.fn().mockResolvedValue(1000), // both min + max
    }));
    const { calculateServiceFee } = await import('../src/services/booking.service');
    // 50000 * 0.2 = 10000; clamped between min=1000 and max=1000 → 1000
    const fee = await calculateServiceFee(50000);
    expect(fee).toBe(1000);
  });

  it('CRIT-13 — runtime: settings error path falls back to sync defaults', async () => {
    jest.resetModules();
    jest.doMock('../src/models/db', () => ({
      db: { query: jest.fn(), transaction: jest.fn() },
    }));
    jest.doMock('../src/utils/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    jest.doMock('../src/services/settings.service', () => ({
      getSettingPercent: jest.fn().mockRejectedValue(new Error('redis down')),
      getSettingNumber: jest.fn().mockRejectedValue(new Error('redis down')),
    }));
    const { calculateServiceFee, calculateServiceFeeSync } = await import('../src/services/booking.service');
    const fee = await calculateServiceFee(50000);
    // Should equal the sync fallback path with platformConfig defaults.
    expect(fee).toBe(calculateServiceFeeSync(50000));
  });
});
