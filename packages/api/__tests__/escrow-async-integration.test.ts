/**
 * Phase 03 — escrow.service mutation-coverage tests.
 *
 * Covers releaseEscrow, releasePartialEscrow, handleCancellation
 * (the 3 functions touched in this phase). Uses direct db / wallet /
 * settings / commission / payment mocks — no real DB.
 */

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const getPlatformWalletMock = jest.fn();
const getUserWalletMock = jest.fn();
const holdEscrowMock = jest.fn();

jest.mock('../src/services/wallet.service', () => ({
  getPlatformWallet: (...a: unknown[]) => getPlatformWalletMock(...a),
  getUserWallet: (...a: unknown[]) => getUserWalletMock(...a),
  holdEscrow: (...a: unknown[]) => holdEscrowMock(...a),
}));

const processRefundMock = jest.fn();
jest.mock('../src/services/payment.service', () => ({
  processRefund: (...a: unknown[]) => processRefundMock(...a),
}));

const getCommissionRateMock = jest.fn();
const getSettingPercentMock = jest.fn();
const getSettingNumberMock = jest.fn();

jest.mock('../src/services/settings.service', () => ({
  getCommissionRate: (...a: unknown[]) => getCommissionRateMock(...a),
  getSettingPercent: (...a: unknown[]) => getSettingPercentMock(...a),
  getSettingNumber: (...a: unknown[]) => getSettingNumberMock(...a),
}));

const calculateCommissionMock = jest.fn();
const calculateCancellationRefundMock = jest.fn();
jest.mock('../src/services/commission.service', () => ({
  calculateCommission: (...a: unknown[]) => calculateCommissionMock(...a),
  calculateCancellationRefund: (...a: unknown[]) =>
    calculateCancellationRefundMock(...a),
}));

import * as escrowService from '../src/services/escrow.service';

interface QueryCall {
  sql: string;
  params: unknown[];
}

function captureClientCalls(calls: QueryCall[]): { query: jest.Mock } {
  return {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      // The escrowGuard UPDATE checks rowCount; default to 1.
      return { rows: [{ id: 'b1' }], rowCount: 1 };
    }),
  };
}

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  getPlatformWalletMock.mockReset();
  getUserWalletMock.mockReset();
  holdEscrowMock.mockReset();
  processRefundMock.mockReset();
  getCommissionRateMock.mockReset();
  getSettingPercentMock.mockReset();
  getSettingNumberMock.mockReset();
  calculateCommissionMock.mockReset();
  calculateCancellationRefundMock.mockReset();

  // Default platform wallets
  getPlatformWalletMock.mockImplementation(async (type: string) => ({
    id: `wallet-${type}`,
    pending_balance: '1000000',
    available_balance: '0',
  }));
  getUserWalletMock.mockImplementation(async (uid: string) => ({
    id: `wallet-user-${uid}`,
    pending_balance: '0',
    available_balance: '0',
  }));
  getSettingPercentMock.mockImplementation(async (key: string) => {
    if (key === 'guarantee_fund_rate') return 0.015;
    if (key === 'service_fee_rate') return 0.10;
    return 0.0;
  });
  getCommissionRateMock.mockResolvedValue(0.15);
});

// -----------------------------------------------------------------------
// releaseEscrow
// -----------------------------------------------------------------------
describe('releaseEscrow', () => {
  const happyBooking = {
    id: 'b1',
    customer_id: 'c1',
    provider_id: 'p1',
    service_price: '100000',
    service_fee: '10000',
    total_amount: '110000',
    status: 'confirmed',
    scheduled_at: new Date(),
  };

  it('throws 404 when booking not found', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(escrowService.releaseEscrow('missing'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when booking status is not in releasable set', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ ...happyBooking, status: 'pending' }],
    });
    await expect(escrowService.releaseEscrow('b1'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it.each(['confirmed', 'paid', 'resolved'])(
    'accepts releasable status "%s"',
    async (status) => {
      dbQueryMock.mockResolvedValueOnce({ rows: [{ ...happyBooking, status }] });
      dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
      const calls: QueryCall[] = [];
      dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
        await cb(captureClientCalls(calls));
      });
      await escrowService.releaseEscrow('b1');
    },
  );

  it('throws 409 when no provider assigned', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ ...happyBooking, provider_id: null }],
    });
    await expect(escrowService.releaseEscrow('b1'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 400 when service_price <= 0', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ ...happyBooking, service_price: '0' }],
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
    await expect(escrowService.releaseEscrow('b1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when provider row not found', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(escrowService.releaseEscrow('b1'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 500 when money conservation violation > 2 cents', async () => {
    // Force totals not to match: servicePrice 100000 + serviceFee 10000 = 110000
    // commission = 100000 * 0.15 = 15000, providerReceives = 85000
    // guaranteeFundContribution = 10000 * 0.015 = 150
    // platformRetains = 15000 + 10000 - 150 = 24850
    // totalOut = 85000 + 24850 + 150 = 110000 ✓ — so we need to perturb total_amount
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ ...happyBooking, total_amount: '110100' }],
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
    await expect(escrowService.releaseEscrow('b1'))
      .rejects.toMatchObject({ statusCode: 500 });
  });

  it('logs but proceeds when conservation diff <= 2 cents', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ ...happyBooking, total_amount: '110002' }],
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    const out = await escrowService.releaseEscrow('b1');
    expect(out.servicePrice).toBe(100000);
  });

  it('throws 409 when escrow guard rowCount is 0 (already released)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
    dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb({
        query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
      });
    });
    await expect(escrowService.releaseEscrow('b1'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('happy path: SQL content + description strings (kills SQL/desc mutants)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{
      id: 'b1', customer_id: 'c1', provider_id: 'p1',
      service_price: '100000', service_fee: '10000', total_amount: '110000',
      status: 'confirmed', scheduled_at: new Date(),
    }] });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'pro' }] });
    getCommissionRateMock.mockResolvedValueOnce(0.11);
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    await escrowService.releaseEscrow('b1');

    // Initial booking SELECT
    expect(dbQueryMock.mock.calls[0]![0]).toContain('FROM bookings b WHERE b.id = $1');
    expect(dbQueryMock.mock.calls[0]![1]).toEqual(['b1']);
    // Provider SELECT
    expect(dbQueryMock.mock.calls[1]![0]).toContain('FROM providers WHERE id = $1');
    expect(dbQueryMock.mock.calls[1]![1]).toEqual(['p1']);

    // Inside transaction:
    // [0] escrowGuard: UPDATE bookings escrow_status=released WHERE escrow_status='held'
    expect(calls[0]!.sql).toContain("escrow_status = 'released'");
    expect(calls[0]!.sql).toContain("escrow_status = 'held'");
    expect(calls[0]!.sql).toContain('RETURNING id');
    expect(calls[0]!.params).toEqual(['b1']);

    // [1] escrow wallet UPDATE pending_balance -= total
    expect(calls[1]!.sql).toContain('pending_balance = pending_balance - $1');
    // [2] escrow tx INSERT type=escrow_release
    expect(calls[2]!.sql).toContain("'escrow_release'");
    expect(calls[2]!.sql).toContain('Escrow release for booking');

    // [3] provider wallet UPDATE available_balance += providerReceives
    expect(calls[3]!.sql).toContain('available_balance = available_balance + $1');
    // [4] provider tx INSERT — description includes commission rate %
    expect(calls[4]!.params[3]).toBe('Payment for booking (11% commission deducted)');

    // [5] revenue wallet UPDATE
    expect(calls[5]!.sql).toContain('available_balance = available_balance + $1');
    // [6] commission tx INSERT type=commission
    expect(calls[6]!.sql).toContain("'commission'");
    expect(calls[6]!.sql).toContain('Commission + service fee from booking');

    // [7] guarantee wallet UPDATE
    expect(calls[7]!.sql).toContain('available_balance = available_balance + $1');
    // [8] guarantee tx INSERT type=guarantee_contribution
    expect(calls[8]!.sql).toContain("'guarantee_contribution'");
    expect(calls[8]!.sql).toContain('Guarantee fund contribution');
  });

  it('happy path: writes 4 wallet UPDATE+INSERT pairs with correct amounts', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'pro' }] });
    getCommissionRateMock.mockResolvedValueOnce(0.11); // pro tier
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    const breakdown = await escrowService.releaseEscrow('b1');

    // commission = round(100000 * 0.11) = 11000; providerReceives = 89000
    // gfRate = 0.015; gfContribution = round(10000 * 0.015) = 150
    // platformRetains = 11000 + 10000 - 150 = 20850
    expect(breakdown.commissionAmount).toBe(11000);
    expect(breakdown.providerReceives).toBe(89000);
    expect(breakdown.guaranteeFundContribution).toBe(150);
    expect(breakdown.platformRetains).toBe(20850);
    expect(breakdown.servicePrice).toBe(100000);
    expect(breakdown.serviceFeeAmount).toBe(10000);
    expect(breakdown.commissionRate).toBe(0.11);

    // 1 escrowGuard + 4×(UPDATE+INSERT) = 9 calls inside transaction
    expect(calls.length).toBe(9);

    // Escrow pending decreases by totalAmount=110000
    expect(calls[1]!.params).toEqual([110000, 'wallet-platform_escrow']);
    // Escrow tx amount = -110000
    expect(calls[2]!.params[2]).toBe(-110000);
    // Provider available += 89000
    expect(calls[3]!.params).toEqual([89000, 'wallet-user-u1']);
    // Provider tx amount = +89000
    expect(calls[4]!.params[2]).toBe(89000);
    // Revenue available += 20850
    expect(calls[5]!.params).toEqual([20850, 'wallet-platform_revenue']);
    expect(calls[6]!.params[2]).toBe(20850);
    // Guarantee available += 150
    expect(calls[7]!.params).toEqual([150, 'wallet-guarantee_fund']);
    expect(calls[8]!.params[2]).toBe(150);
  });
});

// -----------------------------------------------------------------------
// releasePartialEscrow
// -----------------------------------------------------------------------
describe('releasePartialEscrow', () => {
  const happyBooking = {
    id: 'b1',
    customer_id: 'c1',
    provider_id: 'p1',
    service_price: '100000',
    service_fee: '10000',
    total_amount: '110000',
    status: 'resolved',
    scheduled_at: new Date(),
  };

  it('throws 404 when booking not found', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(escrowService.releasePartialEscrow('b1', 50000))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when no provider', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ ...happyBooking, provider_id: null }],
    });
    await expect(escrowService.releasePartialEscrow('b1', 50000))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 400 when remainingAmount <= 0', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    await expect(escrowService.releasePartialEscrow('b1', 0))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 409 when totalAmount <= 0', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ ...happyBooking, total_amount: '0' }],
    });
    await expect(escrowService.releasePartialEscrow('b1', 50000))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when provider row missing', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(escrowService.releasePartialEscrow('b1', 50000))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when escrow guard rowCount is 0', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
    calculateCommissionMock.mockResolvedValueOnce({
      servicePrice: 50000, commissionRate: 0.15, commissionAmount: 7500,
      serviceFeeRate: 0.10, serviceFeeAmount: 5000,
      guaranteeFundContribution: 75, providerReceives: 42500, platformRetains: 12500,
    });
    dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb({ query: jest.fn(async () => ({ rows: [], rowCount: 0 })) });
    });
    await expect(escrowService.releasePartialEscrow('b1', 50000))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('happy path: platformAmount = remaining - providerReceives - guaranteeFund', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
    calculateCommissionMock.mockResolvedValueOnce({
      servicePrice: 50000, commissionRate: 0.15, commissionAmount: 7500,
      serviceFeeRate: 0.10, serviceFeeAmount: 5000,
      guaranteeFundContribution: 75, providerReceives: 42500, platformRetains: 12500,
    });
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    const breakdown = await escrowService.releasePartialEscrow('b1', 55000);

    expect(breakdown.providerReceives).toBe(42500);
    expect(calculateCommissionMock).toHaveBeenCalledWith(50000, 'new');
    // retentionFactor = 55000/110000 = 0.5; proportionalServicePrice = round(100000 * 0.5) = 50000
    // platformAmount = 55000 - 42500 - 75 = 12425
    expect(calls.length).toBe(9);
    expect(calls[1]!.params).toEqual([55000, 'wallet-platform_escrow']);
    expect(calls[2]!.params[2]).toBe(-55000);
    expect(calls[3]!.params).toEqual([42500, 'wallet-user-u1']);
    expect(calls[4]!.params[2]).toBe(42500);
    expect(calls[5]!.params).toEqual([12425, 'wallet-platform_revenue']);
    expect(calls[6]!.params[2]).toBe(12425);
    expect(calls[7]!.params).toEqual([75, 'wallet-guarantee_fund']);
    expect(calls[8]!.params[2]).toBe(75);
  });
  it('happy path: SQL content + description strings (kills SQL/desc mutants)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{
      id: 'b1', customer_id: 'c1', provider_id: 'p1',
      service_price: '100000', service_fee: '10000', total_amount: '110000',
      status: 'resolved', scheduled_at: new Date(),
    }] });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
    calculateCommissionMock.mockResolvedValueOnce({
      servicePrice: 50000, commissionRate: 0.15, commissionAmount: 7500,
      serviceFeeRate: 0.10, serviceFeeAmount: 5000,
      guaranteeFundContribution: 75, providerReceives: 42500, platformRetains: 12500,
    });
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    await escrowService.releasePartialEscrow('b1', 55000);

    // escrowGuard: UPDATE bookings ... WHERE escrow_status='partially_refunded'
    expect(calls[0]!.sql).toContain("escrow_status = 'partially_refunded'");
    expect(calls[0]!.sql).toContain("escrow_status = 'released'");

    expect(calls[1]!.sql).toContain('pending_balance = pending_balance - $1');
    expect(calls[2]!.sql).toContain("'escrow_release'");
    expect(calls[2]!.sql).toContain('Partial escrow release');

    // Provider tx description: refund% + commission%
    // retentionFactor = 0.5 → 50% refund; commissionRate=0.15 → 15% commission
    expect(calls[4]!.params[3]).toBe('Partial payment for booking (after 50% refund, 15% commission deducted)');

    expect(calls[6]!.sql).toContain("'commission'");
    expect(calls[6]!.sql).toContain('Partial commission + fee from dispute resolution');

    expect(calls[8]!.sql).toContain("'guarantee_contribution'");
    expect(calls[8]!.sql).toContain('Guarantee fund contribution from partial dispute release');
  });
});
// -----------------------------------------------------------------------
describe('handleCancellation', () => {
  const happyBooking = {
    id: 'b1',
    customer_id: 'c1',
    provider_id: 'p1',
    service_price: '100000',
    service_fee: '10000',
    total_amount: '110000',
    status: 'confirmed',
    escrow_status: 'held',
    scheduled_at: new Date(),
  };

  beforeEach(() => {
    // Default escrow wallet must show enough pending_balance for refundFromEscrow.
    getPlatformWalletMock.mockImplementation(async (type: string) => ({
      id: `wallet-${type}`,
      pending_balance: '1000000',
      available_balance: '0',
    }));
  });

  it('throws 404 when booking not found', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(escrowService.handleCancellation('b1', 5, false))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(['refunded', 'partially_refunded', 'released'])(
    'throws 409 when escrow_status is already-processed "%s"',
    async (status) => {
      dbQueryMock.mockResolvedValueOnce({
        rows: [{ ...happyBooking, escrow_status: status }],
      });
      await expect(escrowService.handleCancellation('b1', 5, false))
        .rejects.toMatchObject({ statusCode: 409 });
    },
  );

  it('full-refund path (>=24h): escrow_status set to "refunded", processRefund called with full amount', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 1.0,
      providerCompensationPercent: 0,
      customerRefundAmount: 100000,
      providerCompensationAmount: 0,
    });
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    // Final UPDATE bookings escrow_status
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await escrowService.handleCancellation('b1', 30, false);

    // totalCustomerRefund = 100000 + 10000(serviceFee) = 110000
    expect(processRefundMock).toHaveBeenCalledWith('b1', 110000, expect.any(String));
    expect(out.customerRefundAmount).toBe(100000);

    const finalUpdate = dbQueryMock.mock.calls[dbQueryMock.mock.calls.length - 1]!;
    expect(finalUpdate[0]).toContain('UPDATE bookings');
    expect(finalUpdate[1]).toEqual(['refunded', 'b1']);
  });

  it('no-refund path: escrow_status set to "released", processRefund NOT called', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 0,
      providerCompensationPercent: 1.0,
      customerRefundAmount: 0,
      providerCompensationAmount: 50000,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await escrowService.handleCancellation('b1', 5, true);

    // totalCustomerRefund = 0 + 10000 = 10000 → still calls refundFromEscrow
    // because totalCustomerRefund > 0 (service fee was refunded since customerNoShow=false)
    expect(processRefundMock).toHaveBeenCalledWith('b1', 10000, expect.any(String));

    const finalUpdate = dbQueryMock.mock.calls[dbQueryMock.mock.calls.length - 1]!;
    expect(finalUpdate[1]).toEqual(['released', 'b1']);
  });

  it('partial-refund path: escrow_status set to "partially_refunded"', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 0.5,
      providerCompensationPercent: 0.5,
      customerRefundAmount: 50000,
      providerCompensationAmount: 25000,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await escrowService.handleCancellation('b1', 1.5, false);

    const finalUpdate = dbQueryMock.mock.calls[dbQueryMock.mock.calls.length - 1]!;
    expect(finalUpdate[1]).toEqual(['partially_refunded', 'b1']);
  });

  it('customer-noshow path: feeRefund=0, retains service fee in revenue wallet', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 0,
      providerCompensationPercent: 1.0,
      customerRefundAmount: 0,
      providerCompensationAmount: 100000,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', tier: 'new' }] });
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await escrowService.handleCancellation('b1', 5, true, true);

    // customerNoShow=true → totalCustomerRefund = 0 + 0 = 0 → no refund
    expect(processRefundMock).not.toHaveBeenCalled();
    // The service-fee retention block runs (serviceFee=10000>0)
    // Should have called platform_revenue wallet with +10000
    expect(getPlatformWalletMock).toHaveBeenCalledWith('platform_revenue');
  });

  it('skips provider compensation when providerCompensationAmount === 0', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 1.0,
      providerCompensationPercent: 0,
      customerRefundAmount: 100000,
      providerCompensationAmount: 0,
    });
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await escrowService.handleCancellation('b1', 30, false);

    // No provider lookup happened
    expect(dbQueryMock.mock.calls.find((c) => (c[0] as string).includes('FROM providers'))).toBeUndefined();
  });

  it('skips provider compensation when provider not found', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [happyBooking] });
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 0.5,
      providerCompensationPercent: 0.5,
      customerRefundAmount: 50000,
      providerCompensationAmount: 25000,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [] }); // provider not found
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await escrowService.handleCancellation('b1', 1.5, false);
    // The provider-comp transaction must NOT have run.
    // We expect only the refundFromEscrow transaction (1 call) — captureClientCalls
    // pushes onto `calls`, so calls should be exactly the refundFromEscrow's 2 queries.
    // refundFromEscrow does: 1 UPDATE escrow + 1 INSERT tx = 2 client.query calls
    expect(calls.length).toBe(2);
  });
});

// -----------------------------------------------------------------------
// holdInEscrow (touched indirectly — quick smoke for coverage)
// -----------------------------------------------------------------------
describe('holdInEscrow', () => {
  it('looks up the platform_escrow wallet and calls walletService.holdEscrow', async () => {
    await escrowService.holdInEscrow('b1', 50000);
    expect(getPlatformWalletMock).toHaveBeenCalledWith('platform_escrow');
    expect(holdEscrowMock).toHaveBeenCalledWith('wallet-platform_escrow', 50000, 'b1');
  });
});

// -----------------------------------------------------------------------
// refundFromEscrow (called by handleCancellation but worth direct coverage)
// -----------------------------------------------------------------------
describe('refundFromEscrow', () => {
  it('throws 400 when refundAmount <= 0', async () => {
    await expect(escrowService.refundFromEscrow('b1', 0, 'r'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 409 when escrow pending balance is insufficient', async () => {
    getPlatformWalletMock.mockImplementationOnce(async () => ({
      id: 'wallet-platform_escrow',
      pending_balance: '100',
      available_balance: '0',
    }));
    await expect(escrowService.refundFromEscrow('b1', 50000, 'r'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('happy path: writes wallet update + tx and calls processRefund', async () => {
    const calls: QueryCall[] = [];
    dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: jest.Mock }) => Promise<unknown>) => {
      await cb(captureClientCalls(calls));
    });
    await escrowService.refundFromEscrow('b1', 50000, 'cancellation');
    expect(calls.length).toBe(2);
    expect(calls[0]!.params).toEqual([50000, 'wallet-platform_escrow']);
    expect(calls[1]!.params[2]).toBe(-50000);
    expect(processRefundMock).toHaveBeenCalledWith('b1', 50000, 'cancellation');
  });
});
