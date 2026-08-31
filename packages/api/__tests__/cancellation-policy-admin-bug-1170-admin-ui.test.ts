// Bug 1170-admin-ui fix verified.
// Retains executed validation coverage for the dormant versioned-policy
// payload contract. E09 route and UI behavior is covered by real request and
// render tests; obsolete source-content assertions were removed.

import {
  createCancellationPolicySchema,
  type CreateCancellationPolicyInput,
} from '../src/validators/cancellation-policy.validators';

const validInput: CreateCancellationPolicyInput = {
  tiers: [
    { min_hours_before: 24,    max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: '24+ hours before' },
    { min_hours_before: 4,     max_hours_before: 24,   refund_percent: 75,  fee_percent: 25,  label: '4-24 hours before' },
    { min_hours_before: 0,     max_hours_before: 4,    refund_percent: 50,  fee_percent: 50,  label: 'under 4 hours' },
    { min_hours_before: -999,  max_hours_before: 0,    refund_percent: 0,   fee_percent: 100, label: 'after scheduled time / no-show' },
  ],
  intro_text: 'Cancel anytime. Refunds depend on lead time.',
  legal_disclaimer: 'Refund processed to original payment method within 5-10 business days.',
  provider_no_show_credit_php: 200,
};

describe('Bug 1170-admin-ui fix verified — Zod validator', () => {
  it('accepts the canonical 4-tier launch policy', () => {
    const result = createCancellationPolicySchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects empty tiers array', () => {
    const result = createCancellationPolicySchema.safeParse({ ...validInput, tiers: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.format())).toMatch(/[Aa]t least one tier/);
    }
  });

  it('rejects a row whose refund + fee != 100', () => {
    const tiers = validInput.tiers.map((t, i) =>
      i === 1 ? { ...t, refund_percent: 70, fee_percent: 25 } : t,
    );
    const result = createCancellationPolicySchema.safeParse({ ...validInput, tiers });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.format())).toMatch(/refund_percent \+ fee_percent/);
    }
  });

  it('rejects a gap between tiers (row[i].min !== row[i+1].max)', () => {
    const tiers = [
      { min_hours_before: 24,    max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: 'top' },
      { min_hours_before: 6,     max_hours_before: 20,   refund_percent: 75,  fee_percent: 25,  label: 'gap-row' }, // gap: top.min=24 ≠ this.max=20
      { min_hours_before: 0,     max_hours_before: 6,    refund_percent: 50,  fee_percent: 50,  label: 'mid' },
      { min_hours_before: -999,  max_hours_before: 0,    refund_percent: 0,   fee_percent: 100, label: 'bottom' },
    ];
    const result = createCancellationPolicySchema.safeParse({ ...validInput, tiers });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.format())).toMatch(/Boundary mismatch|No gaps or overlaps/);
    }
  });

  it('rejects an overlap between tiers (row[i].min < row[i+1].max)', () => {
    const tiers = [
      { min_hours_before: 24,    max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: 'top' },
      { min_hours_before: 4,     max_hours_before: 30,   refund_percent: 75,  fee_percent: 25,  label: 'overlap-row' },
      { min_hours_before: 0,     max_hours_before: 4,    refund_percent: 50,  fee_percent: 50,  label: 'mid' },
      { min_hours_before: -999,  max_hours_before: 0,    refund_percent: 0,   fee_percent: 100, label: 'bottom' },
    ];
    const result = createCancellationPolicySchema.safeParse({ ...validInput, tiers });
    expect(result.success).toBe(false);
  });

  it('rejects hours not strictly descending', () => {
    const tiers = [
      { min_hours_before: 24,    max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: 'top' },
      { min_hours_before: 24,    max_hours_before: 24,   refund_percent: 75,  fee_percent: 25,  label: 'duplicate-min' },
      { min_hours_before: 0,     max_hours_before: 24,   refund_percent: 50,  fee_percent: 50,  label: 'mid' },
      { min_hours_before: -999,  max_hours_before: 0,    refund_percent: 0,   fee_percent: 100, label: 'bottom' },
    ];
    const result = createCancellationPolicySchema.safeParse({ ...validInput, tiers });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.format())).toMatch(/strictly less|descending/);
    }
  });

  it('rejects when top tier max_hours_before is not null', () => {
    const tiers = validInput.tiers.map((t, i) =>
      i === 0 ? { ...t, max_hours_before: 100 } : t,
    );
    const result = createCancellationPolicySchema.safeParse({ ...validInput, tiers });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.format())).toMatch(/[Tt]op tier/);
    }
  });

  it('rejects when a non-top tier has null max_hours_before', () => {
    const tiers = validInput.tiers.map((t, i) =>
      i === 1 ? { ...t, max_hours_before: null } : t,
    );
    const result = createCancellationPolicySchema.safeParse({ ...validInput, tiers });
    expect(result.success).toBe(false);
  });

  it('rejects when bottom tier does not cover post-scheduled (min_hours_before > 0)', () => {
    const tiers = [
      { min_hours_before: 24,    max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: 'top' },
      { min_hours_before: 4,     max_hours_before: 24,   refund_percent: 75,  fee_percent: 25,  label: 'mid' },
      { min_hours_before: 1,     max_hours_before: 4,    refund_percent: 50,  fee_percent: 50,  label: 'bottom-too-high' },
    ];
    const result = createCancellationPolicySchema.safeParse({ ...validInput, tiers });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.format())).toMatch(/post-scheduled|<= 0/);
    }
  });

  it('rejects negative provider_no_show_credit_php', () => {
    const result = createCancellationPolicySchema.safeParse({ ...validInput, provider_no_show_credit_php: -50 });
    expect(result.success).toBe(false);
  });

  it('rejects unreasonably large provider_no_show_credit_php', () => {
    const result = createCancellationPolicySchema.safeParse({ ...validInput, provider_no_show_credit_php: 99999 });
    expect(result.success).toBe(false);
  });

  it('rejects intro_text shorter than 10 characters', () => {
    const result = createCancellationPolicySchema.safeParse({ ...validInput, intro_text: 'short' });
    expect(result.success).toBe(false);
  });
});
