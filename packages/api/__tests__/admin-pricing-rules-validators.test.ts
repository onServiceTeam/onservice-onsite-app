// Phase 14 Dispatch 05 — admin pricing-rules validator tests (Bug 269).

import {
  createPricingRuleSchema,
  updatePricingRuleSchema,
} from '../src/validators/admin-pricing-rules.validators';

const validInput = {
  name: 'Friday Peak',
  type: 'peak_hours' as const,
  multiplier: 1.5,
  peakStartTime: '18:00',
  peakEndTime: '22:00',
  peakDaysOfWeek: [5, 6],
  categoryScope: { mode: 'global' as const },
  serviceAreaScope: { mode: 'global' as const },
  reason: 'Creating a draft for controlled pricing review.',
};

describe('Bug 269 — createPricingRuleSchema platformSurgeShare 0..1', () => {
  it('accepts a minimal valid input (no platformSurgeShare)', () => {
    expect(createPricingRuleSchema.safeParse(validInput).success).toBe(true);
  });

  it('bug-269-share-bounds: rejects platformSurgeShare > 1', () => {
    const result = createPricingRuleSchema.safeParse({
      ...validInput,
      platformSurgeShare: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('bug-269-share-bounds: rejects platformSurgeShare < 0', () => {
    const result = createPricingRuleSchema.safeParse({
      ...validInput,
      platformSurgeShare: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts platformSurgeShare exactly 0 (provider gets all)', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, platformSurgeShare: 0 }).success,
    ).toBe(true);
  });

  it('accepts platformSurgeShare exactly 1 (platform gets all)', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, platformSurgeShare: 1 }).success,
    ).toBe(true);
  });

  it('accepts platformSurgeShare 0.5', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, platformSurgeShare: 0.5 }).success,
    ).toBe(true);
  });

  it('rejects platformSurgeShare NaN', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, platformSurgeShare: Number.NaN }).success,
    ).toBe(false);
  });

  it('rejects platformSurgeShare Infinity', () => {
    expect(
      createPricingRuleSchema.safeParse({
        ...validInput,
        platformSurgeShare: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
  });
});

describe('createPricingRuleSchema — multiplier 1..5 (existing rule, now schema-enforced)', () => {
  it('rejects multiplier below 1.0', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, multiplier: 0.5 }).success,
    ).toBe(false);
  });

  it('rejects multiplier above 5.0', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, multiplier: 5.5 }).success,
    ).toBe(false);
  });

  it('accepts multiplier exactly at 1.0', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, multiplier: 1.0 }).success,
    ).toBe(true);
  });

  it('accepts multiplier exactly at 5.0', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, multiplier: 5.0 }).success,
    ).toBe(true);
  });
});

describe('createPricingRuleSchema — type + name + peak fields', () => {
  it('rejects invalid type', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, type: 'unknown' as unknown }).success,
    ).toBe(false);
  });

  it('rejects empty name', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, name: '' }).success,
    ).toBe(false);
  });

  it('rejects malformed peakStartTime', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, peakStartTime: 'noon' }).success,
    ).toBe(false);
  });

  it('rejects unknown keys via .strict()', () => {
    expect(
      createPricingRuleSchema.safeParse({ ...validInput, evil: 'x' } as unknown).success,
    ).toBe(false);
  });
});

describe('updatePricingRuleSchema — partial patches honor bounds', () => {
  it('rejects an empty or reason-only patch', () => {
    expect(updatePricingRuleSchema.safeParse({}).success).toBe(false);
    expect(updatePricingRuleSchema.safeParse({
      expectedUpdatedAt: '2026-09-02T00:00:00.000Z',
      reason: 'No actual draft field was changed.',
    }).success).toBe(false);
  });

  it('rejects platformSurgeShare > 1 in patch', () => {
    expect(
      updatePricingRuleSchema.safeParse({
        platformSurgeShare: 1.2,
        expectedUpdatedAt: '2026-09-02T00:00:00.000Z',
        reason: 'Reviewing the platform surge allocation.',
      }).success,
    ).toBe(false);
  });

  it('rejects multiplier > 5 in patch', () => {
    expect(updatePricingRuleSchema.safeParse({
      multiplier: 6,
      expectedUpdatedAt: '2026-09-02T00:00:00.000Z',
      reason: 'Reviewing the customer price multiplier.',
    }).success).toBe(false);
  });

  it('rejects unknown keys via .strict()', () => {
    expect(
      updatePricingRuleSchema.safeParse({
        multiplier: 2,
        expectedUpdatedAt: '2026-09-02T00:00:00.000Z',
        reason: 'Reviewing the customer price multiplier.',
        evil: 'x',
      } as unknown).success,
    ).toBe(false);
  });
});
