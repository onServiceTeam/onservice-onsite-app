const lockWalletsMock = jest.fn();
const providerWalletMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../../src/services/wallet.service', () => ({
  lockWalletsForUpdate: (...args: unknown[]) => lockWalletsMock(...args),
  getUserWalletInTransaction: (...args: unknown[]) => providerWalletMock(...args),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { releaseEscrowInTransaction } from '../../src/services/escrow.service';

const termsRow = {
  id: 'terms-1', booking_id: 'booking-1', version: 3,
  supersedes_terms_id: 'terms-0', terms_state: 'final', pricing_version: 'booking-v1',
  provider_id: 'provider-1', provider_tier: 'new', commission_source: 'tier_default',
  commission_rate_version_id: 'rate-1', commission_rate_basis_points: 1500,
  service_price_centavos: '100000', service_fee_rate_basis_points: 1000,
  service_fee_min_centavos: '2500', service_fee_max_centavos: '50000',
  service_fee_amount_centavos: '10000', guarantee_fund_rate_basis_points: 150,
  guarantee_fund_amount_centavos: '150', commission_amount_centavos: '15000',
  provider_receives_centavos: '85000', platform_retains_centavos: '24850',
  total_amount_centavos: '110000', currency: 'PHP',
  cancellation_policy: {}, setting_sources: {}, fixed_by_event: 'provider_assigned',
  source_event_id: 'offer-1', fixed_at: new Date('2026-09-01T00:00:00Z'),
  created_by: null, metadata: {},
};

it('Bug OPS-233 — escrow release consumes the immutable allocation and conserves every centavo', async () => {
  providerWalletMock.mockResolvedValue({ id: 'wallet-provider' });
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/FROM bookings b WHERE b\.id/.test(sql)) {
      return { rows: [{
        id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1',
        service_price: '100000', service_fee: '10000', total_amount: '110000',
        status: 'confirmed', escrow_status: 'held', scheduled_at: new Date(),
        provider_suspended_during_booking_at: null,
      }], rowCount: 1 };
    }
    if (/FROM booking_financial_terms/.test(sql)) return { rows: [termsRow], rowCount: 1 };
    if (/SELECT user_id FROM providers/.test(sql)) return { rows: [{ user_id: 'provider-user-1' }], rowCount: 1 };
    if (/FROM wallets\s+WHERE user_id IS NULL/.test(sql)) {
      return { rows: [
        { id: 'wallet-escrow', type: 'platform_escrow' },
        { id: 'wallet-revenue', type: 'platform_revenue' },
        { id: 'wallet-guarantee', type: 'guarantee_fund' },
      ], rowCount: 3 };
    }
    if (/UPDATE bookings SET escrow_status = 'released'/.test(sql)) {
      return { rows: [{ id: 'booking-1' }], rowCount: 1 };
    }
    if (/SELECT pending_balance::text/.test(sql)) {
      return { rows: [{ pending_balance: '110000' }], rowCount: 1 };
    }
    if (/COALESCE\(SUM\(amount\), 0\)/.test(sql)) {
      return { rows: [{ remaining: '110000' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });

  const result = await releaseEscrowInTransaction({ query }, 'booking-1');

  expect(result).toMatchObject({
    commissionRate: 0.15,
    commissionAmount: 15000,
    providerReceives: 85000,
    platformRetains: 24850,
    guaranteeFundContribution: 150,
  });
  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({ params: [85000, 'wallet-provider'] }),
    expect.objectContaining({ params: [24850, 'wallet-revenue'] }),
    expect.objectContaining({ params: [150, 'wallet-guarantee'] }),
  ]));
  expect(85000 + 24850 + 150).toBe(110000);
});
