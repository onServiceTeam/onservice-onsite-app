// Phase 14 Dispatch 05 — admin catalog validator tests (Bug 266).

import {
  createAddonSchema,
  updateAddonSchema,
} from '../src/validators/admin-catalog.validators';

const validCreate = {
  subcategoryId: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Extra Bathroom',
  price: 15000,
};

describe('Bug 266 — createAddonSchema (admin addon create)', () => {
  it('accepts a minimal valid input', () => {
    expect(createAddonSchema.safeParse(validCreate).success).toBe(true);
  });

  it('MED-M09 — rejects price above hard backstop (10_000_000 centavos / ₱100,000)', () => {
    const result = createAddonSchema.safeParse({ ...validCreate, price: 10_000_001 });
    expect(result.success).toBe(false);
  });

  it('MED-M09 — accepts price exactly at the hard backstop (10_000_000)', () => {
    expect(createAddonSchema.safeParse({ ...validCreate, price: 10_000_000 }).success).toBe(true);
  });

  it('MED-M09 — accepts the previous cap (5_000_000) since the backstop was raised', () => {
    expect(createAddonSchema.safeParse({ ...validCreate, price: 5_000_000 }).success).toBe(true);
  });

  it('rejects negative price', () => {
    expect(createAddonSchema.safeParse({ ...validCreate, price: -1 }).success).toBe(false);
  });

  it('rejects non-integer price', () => {
    expect(createAddonSchema.safeParse({ ...validCreate, price: 1.5 }).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(createAddonSchema.safeParse({ ...validCreate, name: '' }).success).toBe(false);
  });

  it('rejects name longer than 150 chars', () => {
    expect(
      createAddonSchema.safeParse({ ...validCreate, name: 'A'.repeat(200) }).success,
    ).toBe(false);
  });

  it('rejects non-UUID subcategoryId', () => {
    expect(
      createAddonSchema.safeParse({ ...validCreate, subcategoryId: 'not-uuid' }).success,
    ).toBe(false);
  });

  it('rejects unknown keys via .strict()', () => {
    expect(
      createAddonSchema.safeParse({ ...validCreate, evil: 'x' } as unknown).success,
    ).toBe(false);
  });

  it('rejects NaN price', () => {
    expect(
      createAddonSchema.safeParse({ ...validCreate, price: Number.NaN }).success,
    ).toBe(false);
  });

  it('rejects Infinity price', () => {
    expect(
      createAddonSchema.safeParse({ ...validCreate, price: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
  });
});

describe('Bug 266 — updateAddonSchema (admin addon update)', () => {
  it('rejects an empty patch instead of writing a no-op audit event', () => {
    expect(updateAddonSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a price-only patch within the cap', () => {
    expect(updateAddonSchema.safeParse({ price: 100000 }).success).toBe(true);
  });

  it('MED-M09 — rejects price above the hard backstop (10M centavos)', () => {
    expect(updateAddonSchema.safeParse({ price: 10_000_001 }).success).toBe(false);
  });

  it('rejects unknown keys via .strict()', () => {
    expect(
      updateAddonSchema.safeParse({ price: 100, evil: 'x' } as unknown).success,
    ).toBe(false);
  });
});
