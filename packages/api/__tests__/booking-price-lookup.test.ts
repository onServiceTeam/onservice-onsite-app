import { calculateCommission } from '../src/services/commission.service';

describe('Booking Price Lookup', () => {
  it('should calculate commission based on service_price, not total_amount', () => {
    const servicePrice = 80000;
    const result = calculateCommission(servicePrice, 'new');

    expect(result.servicePrice).toBe(servicePrice);
    expect(result.commissionAmount).toBe(Math.round(servicePrice * 0.15));
    expect(result.providerReceives).toBe(servicePrice - result.commissionAmount);
  });

  it('should not accept zero service price', () => {
    const result = calculateCommission(0, 'new');
    expect(result.providerReceives).toBe(0);
    expect(result.commissionAmount).toBe(0);
  });

  it('should calculate correct service fee from service_price', () => {
    const servicePrice = 100000;
    const result = calculateCommission(servicePrice, 'verified');

    expect(result.serviceFeeAmount).toBe(10000);
    expect(result.serviceFeeRate).toBe(0.10);
  });

  it('should enforce minimum service fee of 2500 centavos', () => {
    const result = calculateCommission(10000, 'new');
    expect(result.serviceFeeAmount).toBe(2500);
  });

  it('should enforce maximum service fee of 50000 centavos', () => {
    const result = calculateCommission(5000000, 'new');
    expect(result.serviceFeeAmount).toBe(50000);
  });

  it('should compute total_amount as servicePrice + serviceFee', () => {
    const prices = [10000, 30000, 50000, 100000, 250000, 500000];
    const tiers = ['new', 'verified', 'pro', 'elite'];

    for (const price of prices) {
      for (const tier of tiers) {
        const result = calculateCommission(price, tier);
        const totalAmount = result.servicePrice + result.serviceFeeAmount;
        expect(totalAmount).toBeGreaterThan(result.servicePrice);
        expect(result.providerReceives + result.platformRetains).toBe(totalAmount);
      }
    }
  });

  it('should use service_price for provider receives, not total_amount', () => {
    const result = calculateCommission(100000, 'elite');
    expect(result.providerReceives).toBeLessThanOrEqual(result.servicePrice);
    expect(result.providerReceives).toBeGreaterThan(0);
    expect(result.providerReceives).toBe(100000 - Math.round(100000 * 0.09));
  });
});
