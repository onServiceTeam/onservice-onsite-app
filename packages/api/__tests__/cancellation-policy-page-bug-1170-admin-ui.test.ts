// Bug 1170-admin-ui fix verified.
// Phase 14 Dispatch 02 — admin editor client-side validation + page wiring.
//
// Tests the validation library in apps/admin/src/lib/ that the page imports,
// plus structural assertions on the page itself (uses the api fetch wrapper,
// guards super_admin, mounts the route in App.tsx).
//
// Full @testing-library/react rendering of the page is deferred — the page
// uses Vite-only @/ aliases that ts-jest doesn't resolve cleanly without
// a separate config. The validation logic is what catches user mistakes
// before submit; that is exercised in full here.

import {
  validateTiers,
  findTier,
  previewOutcome,
  type Tier,
} from '../../../apps/admin/src/lib/cancellation-policy-validation';

const VALID_TIERS: Tier[] = [
  { min_hours_before: 24,    max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: '24+ hours before' },
  { min_hours_before: 4,     max_hours_before: 24,   refund_percent: 75,  fee_percent: 25,  label: '4-24 hours before' },
  { min_hours_before: 0,     max_hours_before: 4,    refund_percent: 50,  fee_percent: 50,  label: 'under 4 hours' },
  { min_hours_before: -999,  max_hours_before: 0,    refund_percent: 0,   fee_percent: 100, label: 'after scheduled time / no-show' },
];

describe('Bug 1170-admin-ui fix verified — validateTiers (admin UI surfacing)', () => {
  it('happy path: valid 4-tier policy passes', () => {
    const out = validateTiers(VALID_TIERS);
    expect(out.ok).toBe(true);
    expect(Object.keys(out.errors)).toHaveLength(0);
    expect(out.summary).toBeNull();
  });

  it('flags row 1 when refund + fee != 100', () => {
    const tiers = VALID_TIERS.map((t, i) =>
      i === 1 ? { ...t, refund_percent: 70, fee_percent: 25 } : t,
    );
    const out = validateTiers(tiers);
    expect(out.ok).toBe(false);
    expect(out.errors[1]).toMatch(/95% \(must equal 100\)/);
    expect(out.summary).toMatch(/Fix the highlighted rows/);
  });

  it('flags a gap between tiers on the bottom row of the boundary', () => {
    const tiers = [
      { min_hours_before: 24,    max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: 'top' },
      { min_hours_before: 6,     max_hours_before: 20,   refund_percent: 75,  fee_percent: 25,  label: 'gap' },
      { min_hours_before: 0,     max_hours_before: 6,    refund_percent: 50,  fee_percent: 50,  label: 'mid' },
      { min_hours_before: -999,  max_hours_before: 0,    refund_percent: 0,   fee_percent: 100, label: 'bottom' },
    ];
    const out = validateTiers(tiers);
    expect(out.ok).toBe(false);
    // The mismatch between tier 1 (min 24) and tier 2 (max 20) is reported on row 2.
    expect(out.errors[1]).toMatch(/Boundary mismatch/);
  });

  it('flags hours-not-descending', () => {
    const tiers = [
      { min_hours_before: 24,    max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: 'top' },
      { min_hours_before: 24,    max_hours_before: 24,   refund_percent: 75,  fee_percent: 25,  label: 'duplicate' },
      { min_hours_before: 0,     max_hours_before: 24,   refund_percent: 50,  fee_percent: 50,  label: 'mid' },
      { min_hours_before: -999,  max_hours_before: 0,    refund_percent: 0,   fee_percent: 100, label: 'bottom' },
    ];
    const out = validateTiers(tiers);
    expect(out.ok).toBe(false);
    expect(out.errors[1]).toMatch(/strictly less/);
  });

  it('flags top tier missing null max', () => {
    const tiers = VALID_TIERS.map((t, i) =>
      i === 0 ? { ...t, max_hours_before: 100 } : t,
    );
    const out = validateTiers(tiers);
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toMatch(/Top tier max_hours_before/);
  });

  it('flags non-top tier with null max', () => {
    const tiers = VALID_TIERS.map((t, i) =>
      i === 1 ? { ...t, max_hours_before: null } : t,
    );
    const out = validateTiers(tiers);
    expect(out.ok).toBe(false);
    expect(out.errors[1]).toMatch(/Only the top tier/);
  });

  it('flags bottom tier not covering post-scheduled', () => {
    const tiers = [
      { min_hours_before: 24,    max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: 'top' },
      { min_hours_before: 4,     max_hours_before: 24,   refund_percent: 75,  fee_percent: 25,  label: 'mid' },
      { min_hours_before: 1,     max_hours_before: 4,    refund_percent: 50,  fee_percent: 50,  label: 'bottom-too-high' },
    ];
    const out = validateTiers(tiers);
    expect(out.ok).toBe(false);
    expect(out.errors[2]).toMatch(/post-scheduled events/);
  });

  it('flags empty tier list', () => {
    const out = validateTiers([]);
    expect(out.ok).toBe(false);
    expect(out.summary).toMatch(/At least one tier/);
  });
});

describe('Bug 1170-admin-ui fix verified — findTier + previewOutcome (preview pane math)', () => {
  it('preview at 20h on a ₱1000 booking returns 4-24 tier with ₱750 refund', () => {
    const out = previewOutcome(20, 100000, VALID_TIERS);
    expect(out.tier?.label).toBe('4-24 hours before');
    expect(out.refund_centavos).toBe(75000);
    expect(out.fee_centavos).toBe(25000);
  });

  it('preview at -1h returns post-scheduled tier with 0 refund', () => {
    const out = previewOutcome(-1, 100000, VALID_TIERS);
    expect(out.tier?.label).toBe('after scheduled time / no-show');
    expect(out.refund_centavos).toBe(0);
    expect(out.fee_centavos).toBe(100000);
  });

  it('preview returns null tier when policy has gap; UI surfaces "no tier matches"', () => {
    const broken: Tier[] = [
      { min_hours_before: 24, max_hours_before: null, refund_percent: 100, fee_percent: 0, label: 'top' },
    ];
    const out = previewOutcome(10, 100000, broken);
    expect(out.tier).toBeNull();
  });

  it('findTier handles the bottom -999 sentinel for late cancellations within sentinel range', () => {
    // hoursBefore = -100 (i.e., 100h after scheduled): falls in the bottom tier
    // because the sentinel min_hours_before = -999 covers post-scheduled values.
    expect(findTier(-100, VALID_TIERS)).toEqual(VALID_TIERS[3]);
  });
});

describe('Bug 1170-admin-ui fix verified — page module structural assertions', () => {
  it('CancellationPolicyPage uses the lib + the existing api fetch wrapper + super_admin guard', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = fs.readFileSync(
      path.join(__dirname, '../../../apps/admin/src/pages/settings/CancellationPolicyPage.tsx'),
      'utf8',
    );
    // Imports the shared validation lib — UI math matches server math.
    expect(file).toMatch(/from '@\/lib\/cancellation-policy-validation'/);
    // Uses the existing api fetch wrapper from PR #7 (Bug 1271) — no axios.
    expect(file).toMatch(/from '@\/lib\/api'/);
    expect(file).not.toMatch(/import\s+axios/);
    // Super-admin guard.
    expect(file).toMatch(/role !== ['"]super_admin['"]/);
    // POST/PUT against the admin endpoints.
    expect(file).toMatch(/\/api\/v1\/admin\/cancellation-policies/);
    // Save button gate on validation.ok.
    expect(file).toMatch(/disabled=\{[^}]*!validation\.ok/);
    // Preview pane.
    expect(file).toMatch(/SAMPLE_BOOKING_PHP/);
  });

  it('shared admin navigation hides the link from non-super-admin', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = fs.readFileSync(
      path.join(__dirname, '../../../apps/admin/src/config/admin-navigation.ts'),
      'utf8',
    );
    expect(file).toMatch(/roles: \[['"]super_admin['"]\]/);
    expect(file).toMatch(/item\.roles\.includes\(role\)/);
    expect(file).toMatch(/\/settings\/cancellation-policy/);
  });

  it('App.tsx mounts the route', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = fs.readFileSync(
      path.join(__dirname, '../../../apps/admin/src/App.tsx'),
      'utf8',
    );
    expect(file).toMatch(/path="\/settings\/cancellation-policy"/);
    expect(file).toMatch(/CancellationPolicyPage/);
  });
});
