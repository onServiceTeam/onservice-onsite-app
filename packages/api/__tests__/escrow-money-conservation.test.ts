/**
 * Phase 03: same settings.service mock as commission.test.ts.
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

describe('Escrow Money Conservation (Phase 03 — async)', () => {
  it('conserves money: providerReceives + platformRetains === servicePrice + serviceFee', async () => {
    const servicePrice = 50000;
    const result = await calculateCommission(servicePrice, 'new');

    expect(result.providerReceives + result.platformRetains).toBe(
      result.servicePrice + result.serviceFeeAmount,
    );
  });

  it('applies 15% commission on service_price for new tier', async () => {
    const result = await calculateCommission(50000, 'new');
    expect(result.commissionAmount).toBe(Math.round(50000 * 0.15));
    expect(result.providerReceives).toBe(50000 - Math.round(50000 * 0.15));
  });

  it('calculates guarantee fund as 1.5% of service fee', async () => {
    const result = await calculateCommission(50000, 'new');
    const expectedGuarantee = Math.round(result.serviceFeeAmount * 0.015);
    expect(result.guaranteeFundContribution).toBe(expectedGuarantee);
  });

  it('passes the exact example: 50000 price, new tier', async () => {
    const result = await calculateCommission(50000, 'new');

    expect(result.servicePrice).toBe(50000);
    expect(result.commissionAmount).toBe(7500);
    expect(result.providerReceives).toBe(42500);
    expect(result.serviceFeeAmount).toBe(5000);
    expect(result.guaranteeFundContribution).toBe(Math.round(5000 * 0.015));
  });

  it('conserves money for all tiers and price tiers', async () => {
    const tiers = ['new', 'verified', 'pro', 'elite'];
    const prices = [10000, 50000, 100000, 500000, 2000000];

    for (const tier of tiers) {
      for (const price of prices) {
        const r = await calculateCommission(price, tier);
        const totalIn = r.servicePrice + r.serviceFeeAmount;
        const totalOut = r.providerReceives + r.platformRetains;
        expect(totalOut).toBe(totalIn);
        expect(r.providerReceives).toBeGreaterThan(0);
        expect(r.platformRetains).toBeGreaterThan(0);
      }
    }
  });

  it('ensures all amounts are integers (centavos)', async () => {
    const result = await calculateCommission(33333, 'pro');
    expect(Number.isInteger(result.commissionAmount)).toBe(true);
    expect(Number.isInteger(result.providerReceives)).toBe(true);
    expect(Number.isInteger(result.serviceFeeAmount)).toBe(true);
    expect(Number.isInteger(result.guaranteeFundContribution)).toBe(true);
    expect(Number.isInteger(result.platformRetains)).toBe(true);
  });
});
