// Phase 14 Dispatch 05 — recurring validator tests (Bug 208 + 1132).
//
// Verifies the new createRecurringSchema rejects `servicePrice` (Bug 208)
// and any other unknown keys (`.strict()`), and accepts the canonical
// shape that triggers server-side price resolution.

import { createRecurringSchema } from '../src/validators/recurring.validators';

const validRecurring = {
  categoryId: '550e8400-e29b-41d4-a716-446655440000',
  subcategoryId: '550e8400-e29b-41d4-a716-446655440001',
  frequency: 'weekly' as const,
  preferredDay: 3,
  preferredTime: '09:30',
  address: '123 Ayala Avenue',
  barangay: 'Legaspi Village',
  city: 'Makati',
  province: 'Metro Manila',
};

describe('Bug 208 — createRecurringSchema rejects client-supplied servicePrice', () => {
  it('bug-208-no-servicePrice: rejects payload that includes servicePrice', () => {
    const result = createRecurringSchema.safeParse({
      ...validRecurring,
      servicePrice: 100000,
    } as unknown);
    expect(result.success).toBe(false);
  });

  it('accepts a payload that has no servicePrice', () => {
    const result = createRecurringSchema.safeParse(validRecurring);
    expect(result.success).toBe(true);
  });
});

describe('Bug 1132 — CreateRecurringParams type-level removal of servicePrice', () => {
  it('bug-1132-encompassed: schema type does not have servicePrice in its inferred shape', () => {
    // Type-level assertion via runtime: parse a payload, ensure result
    // does not surface a servicePrice key after parsing.
    const result = createRecurringSchema.parse(validRecurring) as Record<string, unknown>;
    expect(result.servicePrice).toBeUndefined();
  });
});

describe('createRecurringSchema — strict mode + field validation', () => {
  it('rejects unknown top-level keys (.strict)', () => {
    const result = createRecurringSchema.safeParse({
      ...validRecurring,
      evilField: 'should be rejected',
    } as unknown);
    expect(result.success).toBe(false);
  });

  it('requires subcategoryId (no fallback path)', () => {
    const { subcategoryId: _, ...noSubcat } = validRecurring;
    const result = createRecurringSchema.safeParse(noSubcat);
    expect(result.success).toBe(false);
  });

  it('rejects invalid frequency', () => {
    const result = createRecurringSchema.safeParse({
      ...validRecurring,
      frequency: 'daily',
    } as unknown);
    expect(result.success).toBe(false);
  });

  it('rejects preferredDay below 0', () => {
    const result = createRecurringSchema.safeParse({ ...validRecurring, preferredDay: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects preferredDay above 6', () => {
    const result = createRecurringSchema.safeParse({ ...validRecurring, preferredDay: 7 });
    expect(result.success).toBe(false);
  });

  it('rejects malformed preferredTime', () => {
    const result = createRecurringSchema.safeParse({
      ...validRecurring,
      preferredTime: 'morning',
    });
    expect(result.success).toBe(false);
  });

  it('rejects latitude outside Philippines', () => {
    const result = createRecurringSchema.safeParse({ ...validRecurring, latitude: 40.7 });
    expect(result.success).toBe(false);
  });

  it('rejects longitude outside Philippines', () => {
    const result = createRecurringSchema.safeParse({ ...validRecurring, longitude: -74 });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID categoryId', () => {
    const result = createRecurringSchema.safeParse({
      ...validRecurring,
      categoryId: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });
});
