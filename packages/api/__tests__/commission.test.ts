import { calculateCommission, calculateCancellationRefund } from '../src/services/commission.service';

describe('Commission Calculation Engine', () => {
  describe('calculateCommission', () => {
    it('should apply 20% commission for new providers', () => {
      const result = calculateCommission(100000, 'new');
      expect(result.commissionRate).toBe(0.20);
      expect(result.commissionAmount).toBe(20000);
      expect(result.providerReceives).toBe(80000);
    });

    it('should apply 18% commission for verified providers', () => {
      const result = calculateCommission(100000, 'verified');
      expect(result.commissionRate).toBe(0.18);
      expect(result.commissionAmount).toBe(18000);
      expect(result.providerReceives).toBe(82000);
    });

    it('should apply 15% commission for pro providers', () => {
      const result = calculateCommission(100000, 'pro');
      expect(result.commissionRate).toBe(0.15);
      expect(result.commissionAmount).toBe(15000);
      expect(result.providerReceives).toBe(85000);
    });

    it('should apply 12% commission for elite providers', () => {
      const result = calculateCommission(100000, 'elite');
      expect(result.commissionRate).toBe(0.12);
      expect(result.commissionAmount).toBe(12000);
      expect(result.providerReceives).toBe(88000);
    });

    it('should default to new tier for unknown tiers', () => {
      const result = calculateCommission(100000, 'unknown_tier');
      expect(result.commissionRate).toBe(0.20);
    });

    it('should calculate 5% service fee', () => {
      const result = calculateCommission(100000, 'new');
      expect(result.serviceFeeRate).toBe(0.05);
      expect(result.serviceFeeAmount).toBe(5000);
    });

    it('should enforce minimum service fee of ₱25.00 (2500 centavos)', () => {
      const result = calculateCommission(10000, 'new');
      expect(result.serviceFeeAmount).toBe(2500);
    });

    it('should enforce maximum service fee of ₱500.00 (50000 centavos)', () => {
      const result = calculateCommission(5000000, 'new');
      expect(result.serviceFeeAmount).toBe(50000);
    });

    it('should allocate 1.5% of service fee to guarantee fund', () => {
      const result = calculateCommission(100000, 'new');
      const expected = Math.round(result.serviceFeeAmount * 0.015);
      expect(result.guaranteeFundContribution).toBe(expected);
    });

    it('should ensure provider + platform = service price + service fee', () => {
      const result = calculateCommission(100000, 'pro');
      expect(result.providerReceives + result.platformRetains).toBe(
        result.servicePrice + result.serviceFeeAmount,
      );
    });

    it('should handle small amounts correctly', () => {
      const result = calculateCommission(10000, 'elite');
      expect(result.commissionAmount).toBe(1200);
      expect(result.providerReceives).toBe(8800);
      expect(result.servicePrice).toBe(10000);
    });
  });

  describe('calculateCancellationRefund (FR-102)', () => {
    const servicePrice = 100000;

    it('should give 100% refund if >24h before scheduled time', () => {
      const result = calculateCancellationRefund(servicePrice, 48, false);
      expect(result.customerRefundPercent).toBe(1.00);
      expect(result.providerCompensationPercent).toBe(0);
      expect(result.customerRefundAmount).toBe(100000);
      expect(result.providerCompensationAmount).toBe(0);
    });

    it('should give 100% refund if 2-24h before scheduled time', () => {
      const result = calculateCancellationRefund(servicePrice, 12, false);
      expect(result.customerRefundPercent).toBe(1.00);
    });

    it('should give 90% refund if 1-2h before', () => {
      const result = calculateCancellationRefund(servicePrice, 1.5, false);
      expect(result.customerRefundPercent).toBe(0.90);
      expect(result.providerCompensationPercent).toBe(0.10);
      expect(result.customerRefundAmount).toBe(90000);
      expect(result.providerCompensationAmount).toBe(10000);
    });

    it('should give 80% refund if 30min-1h before', () => {
      const result = calculateCancellationRefund(servicePrice, 0.75, false);
      expect(result.customerRefundPercent).toBe(0.80);
      expect(result.providerCompensationPercent).toBe(0.20);
    });

    it('should give 70% refund if <30min before', () => {
      const result = calculateCancellationRefund(servicePrice, 0.25, false);
      expect(result.customerRefundPercent).toBe(0.70);
      expect(result.providerCompensationPercent).toBe(0.30);
    });

    it('should give 70% refund if after scheduled time (provider en route)', () => {
      const result = calculateCancellationRefund(servicePrice, -0.5, false);
      expect(result.customerRefundPercent).toBe(0.70);
      expect(result.providerCompensationPercent).toBe(0.30);
    });

    it('should give 50% refund if provider has arrived', () => {
      const result = calculateCancellationRefund(servicePrice, 0, true);
      expect(result.customerRefundPercent).toBe(0.50);
      expect(result.providerCompensationPercent).toBe(0.50);
    });

    it('should round amounts to nearest centavo', () => {
      const result = calculateCancellationRefund(33333, 1.5, false);
      expect(Number.isInteger(result.customerRefundAmount)).toBe(true);
      expect(Number.isInteger(result.providerCompensationAmount)).toBe(true);
    });
  });
});
