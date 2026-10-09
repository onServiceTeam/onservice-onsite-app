const lockWalletsMock = jest.fn();
const providerWalletMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/services/wallet.service', () => ({
  lockWalletsForUpdate: (...args: unknown[]) => lockWalletsMock(...args),
  getUserWalletInTransaction: (...args: unknown[]) => providerWalletMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { releaseEscrowInTransaction } from '../src/services/escrow.service';

it('Bug OPS-295 — release after an operator partial refund pays out only the booking remainder', async () => {
  providerWalletMock.mockResolvedValue({ id: 'wallet-provider-295' });
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/FROM bookings b WHERE b\.id/.test(sql)) {
      return { rows: [{
        id: 'booking-295', customer_id: 'customer-295', provider_id: 'provider-295',
        service_price: '100000', service_fee: '10000', total_amount: '110000',
        status: 'confirmed', escrow_status: 'partially_refunded', scheduled_at: new Date(),
        provider_suspended_during_booking_at: null,
      }], rowCount: 1 };
    }
    if (/FROM booking_financial_terms/.test(sql)) {
      return { rows: [{
        id: 'terms-295', booking_id: 'booking-295', version: 1,
        supersedes_terms_id: null, terms_state: 'final', pricing_version: 'booking-v1',
        provider_id: 'provider-295', provider_tier: 'new', commission_source: 'tier_default',
        commission_rate_version_id: 'rate-295', commission_rate_basis_points: 1500,
        service_price_centavos: '100000', service_fee_rate_basis_points: 1000,
        service_fee_min_centavos: '2500', service_fee_max_centavos: '50000',
        service_fee_amount_centavos: '10000', guarantee_fund_rate_basis_points: 150,
        guarantee_fund_amount_centavos: '150', commission_amount_centavos: '15000',
        provider_receives_centavos: '85000', platform_retains_centavos: '24850',
        total_amount_centavos: '110000', currency: 'PHP', cancellation_policy: {},
        setting_sources: {}, fixed_by_event: 'provider_assigned', source_event_id: 'offer-295',
        fixed_at: new Date(), created_by: null, metadata: {},
      }], rowCount: 1 };
    }
    if (/SELECT user_id FROM providers/.test(sql)) return { rows: [{ user_id: 'provider-user-295' }], rowCount: 1 };
    if (/FROM wallets\s+WHERE user_id IS NULL/.test(sql)) {
      return { rows: [
        { id: 'wallet-escrow-295', type: 'platform_escrow' },
        { id: 'wallet-revenue-295', type: 'platform_revenue' },
        { id: 'wallet-guarantee-295', type: 'guarantee_fund' },
      ], rowCount: 3 };
    }
    if (/COALESCE\(SUM\(amount\), 0\)/.test(sql)) return { rows: [{ remaining: '66000' }], rowCount: 1 };
    if (/UPDATE bookings SET escrow_status = 'released'/.test(sql)) {
      expect(params).toEqual(['booking-295', 'partially_refunded']);
      return { rows: [{ id: 'booking-295' }], rowCount: 1 };
    }
    if (/SELECT pending_balance::text/.test(sql)) return { rows: [{ pending_balance: '500000' }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });

  const result = await releaseEscrowInTransaction({ query }, 'booking-295');

  expect(result.providerReceives + result.platformRetains + result.guaranteeFundContribution).toBe(66000);
  expect(calls.find(({ sql }) => /pending_balance = pending_balance -/.test(sql))?.params)
    .toEqual([66000, 'wallet-escrow-295']);
});
