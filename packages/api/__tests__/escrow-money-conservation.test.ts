import { calculateCommission } from '../src/services/commission.service';

describe('Escrow Money Conservation', () => {
  it('should conserve money: providerReceives + platformRetains === servicePrice + serviceFee', () => {
    const servicePrice = 50000;
    const result = calculateCommission(servicePrice, 'new');

    expect(result.providerReceives + result.platformRetains).toBe(
      result.servicePrice + result.serviceFeeAmount,
    );
  });

  it('should apply 20% commission on service_price for new tier', () => {
    const result = calculateCommission(50000, 'new');
    expect(result.commissionAmount).toBe(Math.round(50000 * 0.20));
    expect(result.providerReceives).toBe(50000 - Math.round(50000 * 0.20));
  });

  it('should calculate guarantee fund as 1.5% of service fee', () => {
    const result = calculateCommission(50000, 'new');
    const expectedGuarantee = Math.round(result.serviceFeeAmount * 0.015);
    expect(result.guaranteeFundContribution).toBe(expectedGuarantee);
  });

  it('should pass the exact example: 50000 price, new tier', () => {
    const result = calculateCommission(50000, 'new');

    expect(result.servicePrice).toBe(50000);
    expect(result.commissionRate).toBe(0.20);
    expect(result.commissionAmount).toBe(10000);
    expect(result.providerReceives).toBe(40000);
    expect(result.serviceFeeAmount).toBe(2500);
    expect(result.guaranteeFundContribution).toBe(Math.round(2500 * 0.015));
  });

  it('should conserve money for all tiers', () => {
    const tiers = ['new', 'verified', 'pro', 'elite'];
    const prices = [10000, 50000, 100000, 500000, 2000000];

    for (const tier of tiers) {
      for (const price of prices) {
        const r = calculateCommission(price, tier);
        const totalIn = r.servicePrice + r.serviceFeeAmount;
        const totalOut = r.providerReceives + r.platformRetains;
        expect(totalOut).toBe(totalIn);
        expect(r.providerReceives).toBeGreaterThan(0);
        expect(r.platformRetains).toBeGreaterThan(0);
      }
    }
  });

  it('should ensure all amounts are integers (centavos)', () => {
    const result = calculateCommission(33333, 'pro');
    expect(Number.isInteger(result.commissionAmount)).toBe(true);
    expect(Number.isInteger(result.providerReceives)).toBe(true);
    expect(Number.isInteger(result.serviceFeeAmount)).toBe(true);
    expect(Number.isInteger(result.guaranteeFundContribution)).toBe(true);
    expect(Number.isInteger(result.platformRetains)).toBe(true);
  });
});
