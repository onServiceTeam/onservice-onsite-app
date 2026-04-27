/**
 * Phase 03: settings.service mocked so booking-price math is deterministic.
 */

const SETTINGS_DEFAULTS: Record<string, string> = {
  commission_rate_new: '15',
  commission_rate_verified: '13',
  commission_rate_pro: '11',
  commission_rate_elite: '9',
  service_fee_rate: '10',
  service_fee_min: '2500',
  service_fee_max: '50000',
  guarantee_fund_rate: '1.5',
};

jest.mock('../src/services/settings.service', () => ({
  getSettingNumber: jest.fn(async (k: string) => Number(SETTINGS_DEFAULTS[k])),
  getSettingPercent: jest.fn(async (k: string) => Number(SETTINGS_DEFAULTS[k]) / 100),
  getSettingInteger: jest.fn(async (k: string) => Math.round(Number(SETTINGS_DEFAULTS[k]))),
  getCommissionRate: jest.fn(async (tier: string) => {
    const v = SETTINGS_DEFAULTS[`commission_rate_${tier}`] ?? SETTINGS_DEFAULTS['commission_rate_new']!;
    return Number(v) / 100;
  }),
}));

import { calculateCommission } from '../src/services/commission.service';

describe('Booking Price Lookup (Phase 03 — async)', () => {
  it('calculates commission based on service_price, not total_amount', async () => {
    const servicePrice = 80000;
    const result = await calculateCommission(servicePrice, 'new');

    expect(result.servicePrice).toBe(servicePrice);
    expect(result.commissionAmount).toBe(Math.round(servicePrice * 0.15));
    expect(result.providerReceives).toBe(servicePrice - result.commissionAmount);
  });

  it('handles zero service price', async () => {
    const result = await calculateCommission(0, 'new');
    expect(result.providerReceives).toBe(0);
    expect(result.commissionAmount).toBe(0);
  });

  it('calculates correct service fee from service_price', async () => {
    const servicePrice = 100000;
    const result = await calculateCommission(servicePrice, 'verified');

    expect(result.serviceFeeAmount).toBe(10000);
    expect(result.serviceFeeRate).toBeCloseTo(0.10, 5);
  });

  it('enforces minimum service fee of 2500 centavos', async () => {
    const result = await calculateCommission(10000, 'new');
    expect(result.serviceFeeAmount).toBe(2500);
  });

  it('enforces maximum service fee of 50000 centavos', async () => {
    const result = await calculateCommission(5000000, 'new');
    expect(result.serviceFeeAmount).toBe(50000);
  });

  it('computes total_amount as servicePrice + serviceFee for all tiers', async () => {
    const prices = [10000, 30000, 50000, 100000, 250000, 500000];
    const tiers = ['new', 'verified', 'pro', 'elite'];

    for (const price of prices) {
      for (const tier of tiers) {
        const result = await calculateCommission(price, tier);
        const totalAmount = result.servicePrice + result.serviceFeeAmount;
        expect(totalAmount).toBeGreaterThan(result.servicePrice);
        expect(result.providerReceives + result.platformRetains).toBe(totalAmount);
      }
    }
  });

  it('uses service_price for provider receives, not total_amount', async () => {
    const result = await calculateCommission(100000, 'elite');
    expect(result.providerReceives).toBeLessThanOrEqual(result.servicePrice);
    expect(result.providerReceives).toBeGreaterThan(0);
    expect(result.providerReceives).toBe(100000 - Math.round(100000 * 0.09));
  });
});
