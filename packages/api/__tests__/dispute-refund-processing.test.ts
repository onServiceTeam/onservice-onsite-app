import { calculateCancellationRefund } from '../src/services/commission.service';

describe('Dispute Refund Processing', () => {
  describe('full refund scenarios', () => {
    it('should calculate 100% customer refund for >24h cancellation', () => {
      const result = calculateCancellationRefund(100000, 48, false);
      expect(result.customerRefundPercent).toBe(1.00);
      expect(result.customerRefundAmount).toBe(100000);
      expect(result.providerCompensationAmount).toBe(0);
    });

    it('should ensure refund + compensation equals service price', () => {
      const servicePrice = 75000;
      const result = calculateCancellationRefund(servicePrice, 1, false);
      expect(result.customerRefundAmount + result.providerCompensationAmount).toBe(servicePrice);
    });
  });

  describe('partial refund scenarios', () => {
    it('should calculate 80% refund for <2h cancellation', () => {
      const result = calculateCancellationRefund(100000, 1.5, false);
      expect(result.customerRefundPercent).toBe(0.80);
      expect(result.customerRefundAmount).toBe(80000);
      expect(result.providerCompensationAmount).toBe(20000);
    });

    it('should calculate 50% refund when provider already arrived', () => {
      const result = calculateCancellationRefund(100000, 0, true);
      expect(result.customerRefundPercent).toBe(0.50);
      expect(result.customerRefundAmount).toBe(50000);
      expect(result.providerCompensationAmount).toBe(50000);
    });
  });

  describe('no-show scenarios', () => {
    it('should give 0% refund for customer no-show', () => {
      const result = calculateCancellationRefund(100000, -1, false, true);
      expect(result.customerRefundPercent).toBe(0);
      expect(result.customerRefundAmount).toBe(0);
      expect(result.providerCompensationAmount).toBe(100000);
    });
  });

  describe('money conservation across all refund tiers', () => {
    const testCases = [
      { hours: 48, arrived: false, noShow: false, label: '>24h cancellation' },
      { hours: 12, arrived: false, noShow: false, label: '2-24h cancellation' },
      { hours: 1.5, arrived: false, noShow: false, label: '<2h cancellation' },
      { hours: 0.5, arrived: false, noShow: false, label: '<1h cancellation' },
      { hours: 0, arrived: true, noShow: false, label: 'provider arrived' },
      { hours: -1, arrived: false, noShow: true, label: 'customer no-show' },
    ];

    const prices = [10000, 50000, 100000, 250000, 500000];

    for (const tc of testCases) {
      for (const price of prices) {
        it(`should conserve money: ${tc.label}, price=${price}`, () => {
          const result = calculateCancellationRefund(price, tc.hours, tc.arrived, tc.noShow);
          expect(result.customerRefundAmount + result.providerCompensationAmount).toBe(price);
          expect(result.customerRefundAmount).toBeGreaterThanOrEqual(0);
          expect(result.providerCompensationAmount).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(result.customerRefundAmount)).toBe(true);
          expect(Number.isInteger(result.providerCompensationAmount)).toBe(true);
        });
      }
    }
  });
});
