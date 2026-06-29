// D27 Phase 4b — hourly pricing money math (pure helpers, no db).
//
// resolveHourlyCap = the pre-authorization (what the customer is held for).
// computeHourlySettlement = what they're actually billed (capped at the auth)
// and the unused remainder refunded. These two functions are the entire money
// rule; the escrow wiring just moves the numbers they produce.

import { resolveHourlyCap, computeHourlySettlement } from '../src/services/booking/pricing.service';

const CFG = { hourlyRate: 25000, minBillableMinutes: 60, billingIncrementMinutes: 30, maxEstimatedHours: 8 };

describe('resolveHourlyCap — pre-authorization', () => {
  it('₱250/hr x 3h authorizes ₱750 (75000c) over 3 capped hours', () => {
    expect(resolveHourlyCap(3, CFG)).toEqual({ cappedHours: 3, amountCents: 75000 });
  });

  it('rounds the estimate UP to the billing increment', () => {
    // 2.8h = 168 min -> ceil to 30-min increments = 180 min = 3h.
    expect(resolveHourlyCap(2.8, CFG)).toEqual({ cappedHours: 3, amountCents: 75000 });
  });

  it('floors at the minimum billable', () => {
    // 0.5h rounds to 30 min but the 60-min floor lifts it to 1h.
    expect(resolveHourlyCap(0.5, CFG)).toEqual({ cappedHours: 1, amountCents: 25000 });
  });

  it('requires an estimate', () => {
    expect(() => resolveHourlyCap(0, CFG)).toThrow(/hourly_estimate_required/);
    expect(() => resolveHourlyCap(NaN, CFG)).toThrow(/hourly_estimate_required/);
  });

  it('rejects an estimate over the subcategory max', () => {
    expect(() => resolveHourlyCap(10, CFG)).toThrow(/hourly_estimate_exceeds_max/);
  });

  it('rejects an unconfigured rate', () => {
    expect(() => resolveHourlyCap(3, { ...CFG, hourlyRate: 0 })).toThrow(/hourly_rate_not_configured/);
  });
});

describe('computeHourlySettlement — bill actual, refund the rest', () => {
  const base = {
    estimatedHours: 3,
    servicePrice: 75000, // 3h x ₱250
    serviceFee: 0,        // customer fee is 0 (Ken 2026-06-28)
    totalAmount: 75000,
    minBillableMinutes: 60,
    billingIncrementMinutes: 30,
  };
  const at = (h: number, m: number): Date => new Date(2026, 5, 29, h, m, 0);

  it('under-run: 1h45m worked rounds to 2h, bills ₱500, refunds ₱250', () => {
    const s = computeHourlySettlement({ ...base, workStartedAt: at(9, 0), workCompletedAt: at(10, 45) });
    expect(s.billedHours).toBe(2);
    expect(s.newServicePrice).toBe(50000);
    expect(s.newTotal).toBe(50000);
    expect(s.refundRemainder).toBe(25000);
  });

  it('over-run is CAPPED: 5h worked but only 3h authorized -> bills 3h, refunds 0', () => {
    const s = computeHourlySettlement({ ...base, workStartedAt: at(9, 0), workCompletedAt: at(14, 0) });
    expect(s.billedHours).toBe(3);
    expect(s.newServicePrice).toBe(75000);
    expect(s.refundRemainder).toBe(0);
  });

  it('provider never started the clock -> bills the minimum (1h), refunds the rest', () => {
    const s = computeHourlySettlement({ ...base, workStartedAt: null, workCompletedAt: null });
    expect(s.billedHours).toBe(1);
    expect(s.newServicePrice).toBe(25000);
    expect(s.refundRemainder).toBe(50000);
  });

  it('exact use: billed == estimated -> no refund, full release', () => {
    const s = computeHourlySettlement({ ...base, workStartedAt: at(9, 0), workCompletedAt: at(12, 0) });
    expect(s.billedHours).toBe(3);
    expect(s.refundRemainder).toBe(0);
    expect(s.newTotal).toBe(75000);
  });

  it('conserves money: newTotal + refundRemainder always equals the authorized total', () => {
    for (const mins of [40, 75, 130, 170, 200, 300]) {
      const s = computeHourlySettlement({ ...base, workStartedAt: at(9, 0), workCompletedAt: new Date(at(9, 0).getTime() + mins * 60000) });
      expect(s.newTotal + s.refundRemainder).toBe(base.totalAmount);
      // Never bills above the authorization.
      expect(s.newTotal).toBeLessThanOrEqual(base.totalAmount);
    }
  });
});
