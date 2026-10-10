const dbTransactionMock = jest.fn();
const lockWalletsMock = jest.fn();
const providerWalletMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));
jest.mock('../src/services/wallet.service', () => ({
  lockWalletsForUpdate: (...args: unknown[]) => lockWalletsMock(...args),
  getUserWalletInTransaction: (...args: unknown[]) => providerWalletMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { releasePartialEscrow } from '../src/services/escrow.service';

it('Bug OPS-234 — partial escrow release prorates the immutable terms and preserves conservation', async () => {
  const termsRow = {
    id: 'terms-1', booking_id: 'booking-1', version: 1,
    supersedes_terms_id: null, terms_state: 'final', pricing_version: 'booking-v1',
    provider_id: 'provider-1', provider_tier: 'new', commission_source: 'tier_default',
    commission_rate_version_id: 'rate-1', commission_rate_basis_points: 1500,
    service_price_centavos: '100000', service_fee_rate_basis_points: 1000,
    service_fee_min_centavos: '2500', service_fee_max_centavos: '50000',
    service_fee_amount_centavos: '10000', guarantee_fund_rate_basis_points: 150,
    guarantee_fund_amount_centavos: '150', commission_amount_centavos: '15000',
    provider_receives_centavos: '85000', platform_retains_centavos: '24850',
    total_amount_centavos: '110000', currency: 'PHP', cancellation_policy: {},
    setting_sources: {}, fixed_by_event: 'wallet_payment_authorized',
    source_event_id: 'intent-1', fixed_at: new Date(), created_by: null, metadata: {},
  };
  providerWalletMock.mockResolvedValue({ id: 'wallet-provider' });
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/FROM bookings\s+WHERE id/.test(sql)) return { rows: [{
        id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1',
        service_price: '100000', service_fee: '10000', total_amount: '110000',
        status: 'resolved', escrow_status: 'partially_refunded', scheduled_at: new Date(),
      }], rowCount: 1 };
      if (/FROM booking_financial_terms/.test(sql)) return { rows: [termsRow], rowCount: 1 };
      if (/SELECT user_id FROM providers/.test(sql)) return { rows: [{ user_id: 'provider-user-1' }], rowCount: 1 };
      if (/FROM wallets\s+WHERE user_id IS NULL/.test(sql)) return { rows: [
        { id: 'wallet-escrow', type: 'platform_escrow' },
        { id: 'wallet-revenue', type: 'platform_revenue' },
        { id: 'wallet-guarantee', type: 'guarantee_fund' },
      ], rowCount: 3 };
      if (/UPDATE bookings SET escrow_status = 'released'/.test(sql)) {
        return { rows: [{ id: 'booking-1' }], rowCount: 1 };
      }
      // S2-1: after its 50% refund booking-1 holds the 55,000 being released,
      // and the release is checked against that.
      if (/COALESCE\(SUM\(amount\), 0\)/.test(sql)) return { rows: [{ remaining: '55000' }], rowCount: 1 };
      if (/SELECT pending_balance::text/.test(sql)) return { rows: [{ pending_balance: '55000' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
  };
  dbTransactionMock.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));

  const result = await releasePartialEscrow('booking-1', 55_000);

  expect(result).toMatchObject({
    commissionAmount: 7_500,
    providerReceives: 42_500,
    platformRetains: 12_425,
    guaranteeFundContribution: 75,
  });
  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({ params: [42_500, 'wallet-provider'] }),
    expect.objectContaining({ params: [12_425, 'wallet-revenue'] }),
    expect.objectContaining({ params: [75, 'wallet-guarantee'] }),
  ]));
  expect(42_500 + 12_425 + 75).toBe(55_000);
});
