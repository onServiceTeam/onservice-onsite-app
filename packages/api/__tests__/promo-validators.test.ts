// Phase 14 Dispatch 05 — promo validator tests (Bug 261).

import {
  createPromoCodeSchema,
  applyPromoSchema,
} from '../src/validators/promo.validators';

describe('Bug 261 — createPromoCodeSchema (admin)', () => {
  const validInput = {
    code: 'SAVE10',
    discountType: 'percentage' as const,
    discountValue: 10,
  };

  it('accepts a minimal valid promo', () => {
    expect(createPromoCodeSchema.safeParse(validInput).success).toBe(true);
  });

  it('accepts full optional fields', () => {
    const result = createPromoCodeSchema.safeParse({
      ...validInput,
      description: 'Limited time',
      maxDiscountCentavos: 50000,
      minimumOrderCentavos: 10000,
      usageLimitTotal: 100,
      usageLimitPerCustomer: 1,
      validFrom: '2026-04-01T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys via .strict()', () => {
    const result = createPromoCodeSchema.safeParse({
      ...validInput,
      injectedField: 'x',
    } as unknown);
    expect(result.success).toBe(false);
  });

  it('rejects discountType not in enum', () => {
    const result = createPromoCodeSchema.safeParse({
      ...validInput,
      discountType: 'percent' as unknown,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative discountValue', () => {
    const result = createPromoCodeSchema.safeParse({ ...validInput, discountValue: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects zero discountValue', () => {
    const result = createPromoCodeSchema.safeParse({ ...validInput, discountValue: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer discountValue', () => {
    const result = createPromoCodeSchema.safeParse({ ...validInput, discountValue: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects code longer than 40 chars', () => {
    const result = createPromoCodeSchema.safeParse({
      ...validInput,
      code: 'A'.repeat(50),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty code', () => {
    const result = createPromoCodeSchema.safeParse({ ...validInput, code: '' });
    expect(result.success).toBe(false);
  });

  it('accepts maxDiscountCentavos as null (no cap)', () => {
    const result = createPromoCodeSchema.safeParse({
      ...validInput,
      maxDiscountCentavos: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts validUntil as null (no end date)', () => {
    const result = createPromoCodeSchema.safeParse({
      ...validInput,
      validUntil: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('Bug 261 — applyPromoSchema (customer)', () => {
  it('accepts a code-only payload', () => {
    expect(applyPromoSchema.safeParse({ code: 'SAVE10' }).success).toBe(true);
  });

  it('rejects unknown keys via .strict() (no client discount injection)', () => {
    const result = applyPromoSchema.safeParse({
      code: 'SAVE10',
      discountValue: 99999,
    } as unknown);
    expect(result.success).toBe(false);
  });

  it('rejects empty code', () => {
    expect(applyPromoSchema.safeParse({ code: '' }).success).toBe(false);
  });

  it('rejects code longer than 40 chars', () => {
    expect(applyPromoSchema.safeParse({ code: 'A'.repeat(50) }).success).toBe(false);
  });
});
