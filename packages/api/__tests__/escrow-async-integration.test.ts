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
describe('handleCancellation (MED-N27 — trx-aware wrapper, all queries via client.query)', () => {
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
    // BUG-PHASE78-01 test maintenance — handleCancellation in
    // escrow.service.ts:470 SELECTs service_fee BEFORE the trx so
    // post-commit PayMongo refund knows the total. All tests in this
    // describe block need this mock primed; queue it once per test.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ service_fee: 10000 }],
      rowCount: 1,
    });
  });

  /**
   * MED-N27 fix — handleCancellation is now a thin wrapper around
   * db.transaction((client) => handleCancellationInTransaction(...)).
   * That means EVERY query (the booking SELECT FOR UPDATE, the
   * provider lookup, the wallet UPDATEs / INSERTs, the final
   * UPDATE bookings escrow_status) goes through client.query, not
   * db.query. processRefundMock is no longer called either —
   * refundFromEscrowInTransaction handles the wallet movements
   * directly inside the trx.
   *
   * Helper: build a client mock that responds in sequence to the
   * queries handleCancellationInTransaction issues.
   */
  function buildClientForCancellation(opts: {
    bookingRow?: Record<string, unknown> | null;
    providerRow?: Record<string, unknown> | null;
  }): { calls: QueryCall[]; client: { query: jest.Mock } } {
    const calls: QueryCall[] = [];
    let bookingSelectIdx = -1;
    let providerSelectIdx = -1;
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM bookings WHERE id = $1 FOR UPDATE')) {
        bookingSelectIdx = calls.length - 1;
        return opts.bookingRow ? { rows: [opts.bookingRow], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT user_id, tier FROM providers WHERE id = $1')) {
        providerSelectIdx = calls.length - 1;
        return opts.providerRow ? { rows: [opts.providerRow], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      // refundFromEscrowInTransaction: SELECT wallet
      if (sql.includes('FROM wallets WHERE id = $1') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 'wallet-platform_escrow', pending_balance: '1000000' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    void bookingSelectIdx; void providerSelectIdx;
    return { calls, client: { query } };
  }

  it('MED-N27 — throws 404 when booking not found (inside trx)', async () => {
    const { client } = buildClientForCancellation({ bookingRow: null });
    dbTransactionMock.mockImplementation(async (cb: (c: typeof client) => Promise<unknown>) => cb(client));
    await expect(escrowService.handleCancellation('b1', 5, false))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(['refunded', 'partially_refunded', 'released'])(
    'MED-N27 — throws 409 when escrow_status already-processed "%s" (inside trx)',
    async (status) => {
      const { client } = buildClientForCancellation({
        bookingRow: { ...happyBooking, escrow_status: status },
      });
      dbTransactionMock.mockImplementation(async (cb: (c: typeof client) => Promise<unknown>) => cb(client));
      await expect(escrowService.handleCancellation('b1', 5, false))
        .rejects.toMatchObject({ statusCode: 409 });
    },
  );

  it('MED-N27 — full-refund path: final UPDATE bookings escrow_status="refunded" runs in trx', async () => {
    const { client, calls } = buildClientForCancellation({ bookingRow: happyBooking, providerRow: null });
    dbTransactionMock.mockImplementation(async (cb: (c: typeof client) => Promise<unknown>) => cb(client));
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 1.0,
      providerCompensationPercent: 0,
      customerRefundAmount: 100000,
      providerCompensationAmount: 0,
    });
    const out = await escrowService.handleCancellation('b1', 30, false);
    expect(out.customerRefundAmount).toBe(100000);
    // BUG-PHASE78-01 test maintenance — pre-MED-N27 the test asserted
    // processRefundMock was never called. BUG-PHASE26-01 (Phase 26)
    // reintroduced a POST-commit call to processRefund so the PayMongo
    // refund actually returns money to the customer's bank — but the
    // wallet movements still happen entirely inside the trx via
    // refundFromEscrowInTransaction (which is what MED-N27 was about).
    // What MED-N27 still guarantees: the final UPDATE bookings runs
    // inside the captured trx calls. That's what the assertion below
    // checks. The processRefund post-commit call is expected behavior.
    const finalUpdate = calls[calls.length - 1]!;
    expect(finalUpdate.sql).toContain('UPDATE bookings');
    expect(finalUpdate.params).toEqual(['refunded', 'b1']);
  });

  it('MED-N27 — no-refund (provider arrived) path: escrow_status="released" + provider compensation in trx', async () => {
    const { client, calls } = buildClientForCancellation({
      bookingRow: happyBooking,
      providerRow: { user_id: 'u1', tier: 'new' },
    });
    dbTransactionMock.mockImplementation(async (cb: (c: typeof client) => Promise<unknown>) => cb(client));
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 0,
      providerCompensationPercent: 1.0,
      customerRefundAmount: 0,
      providerCompensationAmount: 50000,
    });
    getUserWalletMock.mockResolvedValueOnce({ id: 'wallet-user-u1' });
    await escrowService.handleCancellation('b1', 5, true);
    expect(processRefundMock).not.toHaveBeenCalled();
    const finalUpdate = calls[calls.length - 1]!;
    expect(finalUpdate.params).toEqual(['released', 'b1']);
  });

  it('MED-N27 — partial-refund path: escrow_status="partially_refunded"', async () => {
    const { client, calls } = buildClientForCancellation({
      bookingRow: happyBooking,
      providerRow: { user_id: 'u1', tier: 'new' },
    });
    dbTransactionMock.mockImplementation(async (cb: (c: typeof client) => Promise<unknown>) => cb(client));
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 0.5,
      providerCompensationPercent: 0.5,
      customerRefundAmount: 50000,
      providerCompensationAmount: 25000,
    });
    getUserWalletMock.mockResolvedValueOnce({ id: 'wallet-user-u1' });
    await escrowService.handleCancellation('b1', 1.5, false);
    const finalUpdate = calls[calls.length - 1]!;
    expect(finalUpdate.params).toEqual(['partially_refunded', 'b1']);
  });

  it('MED-N27 — customer-noshow: service fee retained in platform_revenue (in trx)', async () => {
    const { client } = buildClientForCancellation({
      bookingRow: happyBooking,
      providerRow: { user_id: 'u1', tier: 'new' },
    });
    dbTransactionMock.mockImplementation(async (cb: (c: typeof client) => Promise<unknown>) => cb(client));
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 0,
      providerCompensationPercent: 1.0,
      customerRefundAmount: 0,
      providerCompensationAmount: 100000,
    });
    getUserWalletMock.mockResolvedValueOnce({ id: 'wallet-user-u1' });
    await escrowService.handleCancellation('b1', 5, true, true);
    expect(processRefundMock).not.toHaveBeenCalled();
    expect(getPlatformWalletMock).toHaveBeenCalledWith('platform_revenue');
  });

  it('MED-N27 — skips provider lookup when providerCompensationAmount === 0', async () => {
    const { client, calls } = buildClientForCancellation({ bookingRow: happyBooking });
    dbTransactionMock.mockImplementation(async (cb: (c: typeof client) => Promise<unknown>) => cb(client));
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 1.0,
      providerCompensationPercent: 0,
      customerRefundAmount: 100000,
      providerCompensationAmount: 0,
    });
    await escrowService.handleCancellation('b1', 30, false);
    // No SELECT FROM providers in any captured call.
    expect(calls.find((c) => c.sql.includes('FROM providers'))).toBeUndefined();
  });

  it('MED-N27 — skips provider compensation when provider not found', async () => {
    const { client, calls } = buildClientForCancellation({
      bookingRow: happyBooking,
      providerRow: null,
    });
    dbTransactionMock.mockImplementation(async (cb: (c: typeof client) => Promise<unknown>) => cb(client));
    calculateCancellationRefundMock.mockResolvedValueOnce({
      customerRefundPercent: 0.5,
      providerCompensationPercent: 0.5,
      customerRefundAmount: 50000,
      providerCompensationAmount: 25000,
    });
    await escrowService.handleCancellation('b1', 1.5, false);
    // Provider SELECT was attempted (returned 0), but the wallet
    // movement INSERTs for provider compensation should not have run.
    const provComp = calls.find((c) =>
      c.sql.includes('Cancellation compensation'),
    );
    expect(provComp).toBeUndefined();
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
