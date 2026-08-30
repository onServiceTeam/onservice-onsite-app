// MED-N25 + MED-N26 fix verified — releasePartialEscrow now refuses
// to disburse when the math is wrong.
//
// MED-N25: pre-fix `platformAmount = remainingAmount - providerReceives
// - guaranteeContribution` could go NEGATIVE in edge cases where
// proportional commission yielded provider+guarantee > remainingAmount
// (booking with serviceFee dominating total + small remainder after
// refund). The platform_revenue wallet would receive a negative credit
// recorded as 'commission' = money creation. Pre-flight guard now
// throws 500 before any wallet write.
//
// MED-N26: pre-fix the function performed 4 wallet credits/debits
// without summing them and verifying the result equals remainingAmount.
// Same drift risk as CRIT-N04 on the full-release path. Pre-flight
// conservation check now throws 500 if totalOut !== remainingAmount
// (with 1-2 cent rounding tolerance, matching the full-release guard).

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const calculateCommissionMock = jest.fn();
jest.mock('../src/services/commission.service', () => ({
  calculateCommission: (...args: unknown[]) => calculateCommissionMock(...args),
}));

const getPlatformWalletMock = jest.fn();
const getUserWalletMock = jest.fn();
jest.mock('../src/services/wallet.service', () => ({
  getPlatformWallet: (...args: unknown[]) => getPlatformWalletMock(...args),
  getUserWallet: (...args: unknown[]) => getUserWalletMock(...args),
  // A5 — releasePartialEscrow now row-locks the wallets up front (no-op here).
  lockWalletsForUpdate: jest.fn(),
}));

jest.mock('../src/services/settings.service', () => ({
  getCommissionRate: jest.fn(async () => 0.15),
  getSettingPercent: jest.fn(async () => 0.015),
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

import * as escrowService from '../src/services/escrow.service';

function setupBookingAndProvider(opts: { totalAmount: number; servicePrice: number; serviceFee: number }) {
  // booking SELECT
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      id: 'b-1', customer_id: 'c-1', provider_id: 'p-1',
      service_price: opts.servicePrice,
      service_fee: opts.serviceFee,
      total_amount: opts.totalAmount,
      status: 'resolved', scheduled_at: new Date(),
    }],
  });
  // provider SELECT
  dbQueryMock.mockResolvedValueOnce({
    rows: [{ user_id: 'pu-1', tier: 'new' }],
  });
  // platform + provider wallets
  getPlatformWalletMock.mockResolvedValue({ id: 'w-platform' });
  getUserWalletMock.mockResolvedValue({ id: 'w-provider' });
}

describe('MED-N25 — releasePartialEscrow refuses negative platformAmount', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    dbTransactionMock.mockReset();
    calculateCommissionMock.mockReset();
    getPlatformWalletMock.mockReset();
    getUserWalletMock.mockReset();
  });

  it('throws 500 when providerReceives + guarantee > remainingAmount', async () => {
    setupBookingAndProvider({ totalAmount: 110000, servicePrice: 100000, serviceFee: 10000 });
    // Force a breakdown that, on the small remainingAmount, yields
    // provider+guarantee > remainingAmount. Real commission math
    // wouldn't produce this organically; we construct it to exercise
    // the guard.
    calculateCommissionMock.mockResolvedValueOnce({
      providerReceives: 800,        // 800 + 50 = 850 > 200
      guaranteeFundContribution: 50,
      commissionRate: 0.15,
    });

    await expect(
      escrowService.releasePartialEscrow('b-1', 200), // tiny remaining
    ).rejects.toMatchObject({ statusCode: 500 });

    // Transaction must NOT have run.
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it('proceeds when platformAmount is non-negative', async () => {
    setupBookingAndProvider({ totalAmount: 110000, servicePrice: 100000, serviceFee: 10000 });
    // Conservation-respecting breakdown for a 50,000 remaining.
    // remainingAmount = 50000 = 40000 (provider) + 9250 (platform) + 750 (guarantee)
    calculateCommissionMock.mockResolvedValueOnce({
      providerReceives: 40_000,
      guaranteeFundContribution: 750,
      commissionRate: 0.15,
    });
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 'b-1' }], rowCount: 1 }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    const result = await escrowService.releasePartialEscrow('b-1', 50_000);
    expect(result.providerReceives).toBe(40_000);
  });
});

describe('MED-N26 — releasePartialEscrow conservation guard', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    dbTransactionMock.mockReset();
    calculateCommissionMock.mockReset();
    getPlatformWalletMock.mockReset();
    getUserWalletMock.mockReset();
  });

  it('tolerates rounding error of 1 centavo (debug log, no throw)', async () => {
    setupBookingAndProvider({ totalAmount: 110000, servicePrice: 100000, serviceFee: 10000 });
    // Construct a breakdown that's off by exactly 1 centavo.
    // remainingAmount = 50000, totalOut = 49999.
    calculateCommissionMock.mockResolvedValueOnce({
      providerReceives: 39_999,
      guaranteeFundContribution: 750,
      commissionRate: 0.15,
    });
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 'b-1' }], rowCount: 1 }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    const result = await escrowService.releasePartialEscrow('b-1', 50_000);
    expect(result.providerReceives).toBe(39_999);
  });

  it('passes when math conserves exactly', async () => {
    setupBookingAndProvider({ totalAmount: 110000, servicePrice: 100000, serviceFee: 10000 });
    // 50000 = 40000 (provider) + 9250 (platform) + 750 (guarantee). Exact.
    calculateCommissionMock.mockResolvedValueOnce({
      providerReceives: 40_000,
      guaranteeFundContribution: 750,
      commissionRate: 0.15,
    });
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 'b-1' }], rowCount: 1 }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    const result = await escrowService.releasePartialEscrow('b-1', 50_000);
    expect(result).toBeDefined();
  });
});
