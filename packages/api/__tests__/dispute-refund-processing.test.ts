/**
 * Phase 03: settings.service mocked so cancellation-refund math is deterministic.
 * Refund schedule per migration 050 seed values.
 */

const SETTINGS_DEFAULTS: Record<string, string> = {
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
  getCommissionRate: jest.fn(async () => 0.15),
}));

import { calculateCancellationRefund } from '../src/services/commission.service';

describe('Dispute Refund Processing (Phase 03 — async)', () => {
  describe('full refund scenarios', () => {
    it('100% customer refund for >24h cancellation', async () => {
      const r = await calculateCancellationRefund(100000, 48, false);
      expect(r.customerRefundPercent).toBe(1.00);
      expect(r.customerRefundAmount).toBe(100000);
      expect(r.providerCompensationAmount).toBe(0);
    });

    it('refund + compensation always equals service price', async () => {
      const servicePrice = 75000;
      const r = await calculateCancellationRefund(servicePrice, 1, false);
      expect(r.customerRefundAmount + r.providerCompensationAmount).toBe(servicePrice);
    });
  });

  describe('partial refund scenarios', () => {
    it('90% refund for 1-2h cancellation', async () => {
      const r = await calculateCancellationRefund(100000, 1.5, false);
      expect(r.customerRefundPercent).toBeCloseTo(0.90, 5);
      expect(r.customerRefundAmount).toBe(90000);
      expect(r.providerCompensationAmount).toBe(10000);
    });

    it('50% refund when provider already arrived', async () => {
      const r = await calculateCancellationRefund(100000, 0, true);
      expect(r.customerRefundPercent).toBe(0.50);
      expect(r.customerRefundAmount).toBe(50000);
      expect(r.providerCompensationAmount).toBe(50000);
    });
  });

  describe('no-show scenarios', () => {
    it('0% refund for customer no-show', async () => {
      const r = await calculateCancellationRefund(100000, -1, false, true);
      expect(r.customerRefundPercent).toBe(0);
      expect(r.customerRefundAmount).toBe(0);
      expect(r.providerCompensationAmount).toBe(100000);
    });
  });

  describe('money conservation across all refund tiers', () => {
    const cases = [
      { hours: 48,   arrived: false, noShow: false, label: '>24h' },
      { hours: 12,   arrived: false, noShow: false, label: '2-24h' },
      { hours: 1.5,  arrived: false, noShow: false, label: '1-2h' },
      { hours: 0.75, arrived: false, noShow: false, label: '30m-1h' },
      { hours: 0.25, arrived: false, noShow: false, label: '<30m' },
      { hours: 0,    arrived: true,  noShow: false, label: 'arrived' },
      { hours: -1,   arrived: false, noShow: true,  label: 'no-show' },
    ];
    const prices = [10000, 50000, 100000, 250000, 500000];

    for (const tc of cases) {
      for (const price of prices) {
        it(`conserves money: ${tc.label}, price=${price}`, async () => {
          const r = await calculateCancellationRefund(price, tc.hours, tc.arrived, tc.noShow);
          expect(r.customerRefundAmount + r.providerCompensationAmount).toBe(price);
          expect(r.customerRefundAmount).toBeGreaterThanOrEqual(0);
          expect(r.providerCompensationAmount).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(r.customerRefundAmount)).toBe(true);
          expect(Number.isInteger(r.providerCompensationAmount)).toBe(true);
        });
      }
    }
  });
});
