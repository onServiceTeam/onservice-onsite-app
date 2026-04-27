/**
 * Phase 03: settings.service mocked so commission math is deterministic
 * without a live DB or Redis. Defaults match migration 050 seed values.
 */

const SETTINGS_DEFAULTS: Record<string, string> = {
  commission_rate_founding: '10',
  commission_rate_new: '15',
  commission_rate_verified: '13',
  commission_rate_pro: '11',
  commission_rate_elite: '9',
  service_fee_rate: '10',
  service_fee_min: '2500',
  service_fee_max: '50000',
  guarantee_fund_rate: '1.5',
  cancel_refund_over_24h: '100',
  cancel_refund_2_to_24h: '100',
  cancel_refund_1_to_2h: '90',
  cancel_refund_30min_to_1h: '80',
  cancel_refund_under_30min: '70',
  cancel_refund_provider_arrived: '50',
  cancel_refund_customer_noshow: '0',
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

import { calculateCommission, calculateCancellationRefund } from '../src/services/commission.service';

describe('Commission Calculation Engine (Phase 03 — async)', () => {
  describe('calculateCommission', () => {
    it('should apply 15% commission for new providers', async () => {
      const result = await calculateCommission(100000, 'new');
      expect(result.commissionRate).toBeCloseTo(0.15, 5);
      expect(result.commissionAmount).toBe(15000);
      expect(result.providerReceives).toBe(85000);
    });

    it('should apply 13% commission for verified providers', async () => {
      const result = await calculateCommission(100000, 'verified');
      expect(result.commissionRate).toBeCloseTo(0.13, 5);
      expect(result.commissionAmount).toBe(13000);
    });

    it('should apply 11% commission for pro providers', async () => {
      const result = await calculateCommission(100000, 'pro');
      expect(result.commissionRate).toBeCloseTo(0.11, 5);
      expect(result.commissionAmount).toBe(11000);
    });

    it('should apply 9% commission for elite providers', async () => {
      const result = await calculateCommission(100000, 'elite');
      expect(result.commissionRate).toBeCloseTo(0.09, 5);
      expect(result.commissionAmount).toBe(9000);
    });

    it('should default to new tier for unknown tiers', async () => {
      const result = await calculateCommission(100000, 'unknown_tier');
      expect(result.commissionRate).toBeCloseTo(0.15, 5);
    });

    it('should calculate 10% service fee', async () => {
      const result = await calculateCommission(100000, 'new');
      expect(result.serviceFeeRate).toBeCloseTo(0.10, 5);
      expect(result.serviceFeeAmount).toBe(10000);
    });

    it('should enforce minimum service fee of 2500 centavos', async () => {
      const result = await calculateCommission(10000, 'new');
      expect(result.serviceFeeAmount).toBe(2500);
    });

    it('should enforce maximum service fee of 50000 centavos', async () => {
      const result = await calculateCommission(5000000, 'new');
      expect(result.serviceFeeAmount).toBe(50000);
    });

    it('should allocate 1.5% of service fee to guarantee fund', async () => {
      const result = await calculateCommission(100000, 'new');
      const expected = Math.round(result.serviceFeeAmount * 0.015);
      expect(result.guaranteeFundContribution).toBe(expected);
    });

    it('should ensure provider + platform = service price + service fee', async () => {
      const result = await calculateCommission(100000, 'pro');
      expect(result.providerReceives + result.platformRetains).toBe(
        result.servicePrice + result.serviceFeeAmount,
      );
    });

    it('should handle small amounts correctly', async () => {
      const result = await calculateCommission(10000, 'elite');
      expect(result.commissionAmount).toBe(900);
      expect(result.providerReceives).toBe(9100);
    });
  });

  describe('calculateCancellationRefund (Phase 03 settings-backed schedule)', () => {
    const servicePrice = 100000;

    it('100% refund if >24h before scheduled time', async () => {
      const r = await calculateCancellationRefund(servicePrice, 48, false);
      expect(r.customerRefundPercent).toBe(1.00);
      expect(r.providerCompensationPercent).toBe(0);
      expect(r.customerRefundAmount).toBe(100000);
    });

    it('100% refund if 2-24h before', async () => {
      const r = await calculateCancellationRefund(servicePrice, 12, false);
      expect(r.customerRefundPercent).toBe(1.00);
    });

    it('90% refund if 1-2h before', async () => {
      const r = await calculateCancellationRefund(servicePrice, 1.5, false);
      expect(r.customerRefundPercent).toBeCloseTo(0.90, 5);
      expect(r.customerRefundAmount).toBe(90000);
      expect(r.providerCompensationAmount).toBe(10000);
    });

    it('80% refund if 30min-1h before', async () => {
      const r = await calculateCancellationRefund(servicePrice, 0.75, false);
      expect(r.customerRefundPercent).toBeCloseTo(0.80, 5);
    });

    it('70% refund if <30min before or after scheduled (provider not arrived)', async () => {
      const r1 = await calculateCancellationRefund(servicePrice, 0.25, false);
      expect(r1.customerRefundPercent).toBeCloseTo(0.70, 5);
      const r2 = await calculateCancellationRefund(servicePrice, -0.5, false);
      expect(r2.customerRefundPercent).toBeCloseTo(0.70, 5);
    });

    it('50% refund if provider has arrived', async () => {
      const r = await calculateCancellationRefund(servicePrice, 0, true);
      expect(r.customerRefundPercent).toBe(0.50);
      expect(r.providerCompensationPercent).toBe(0.50);
    });

    it('0% refund for customer no-show', async () => {
      const r = await calculateCancellationRefund(servicePrice, -1, false, true);
      expect(r.customerRefundPercent).toBe(0);
      expect(r.providerCompensationAmount).toBe(100000);
    });

    it('rounds amounts to nearest centavo', async () => {
      const r = await calculateCancellationRefund(33333, 1.5, false);
      expect(Number.isInteger(r.customerRefundAmount)).toBe(true);
      expect(Number.isInteger(r.providerCompensationAmount)).toBe(true);
    });
  });
});
