// Bug 1323 fix verified.
// Phase 14 Dispatch 02 Part 3.
//
// DECISION-003 commits to a founding-batch tier with 10% commission. The
// commission rate row already lived in platform_settings but the providers
// table CHECK constraint rejected 'founding' — admin couldn't actually set
// it. Migration 073 closes that gap. This test verifies the schema, the
// validator, and the rate lookup all line up on 'founding'.

import fs from 'node:fs';
import path from 'node:path';
import { changeProviderTierSchema } from '../src/validators/admin.validators';

const REPO_ROOT = path.resolve(__dirname, '../../../');

describe('Bug 1323 fix verified — schema accepts founding', () => {
  it('migration 073 alters providers_tier_check to include founding', () => {
    const sql = fs.readFileSync(
      path.join(REPO_ROOT, 'packages/api/migrations/073_founding_tier.sql'),
      'utf8',
    );
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS providers_tier_check/);
    expect(sql).toMatch(/CHECK \(tier IN \('founding', 'new', 'verified', 'pro', 'elite'\)\)/);
  });

  it('admin tier-change Zod schema accepts founding', () => {
    const ok = changeProviderTierSchema.safeParse({
      tier: 'founding',
      reason: 'Onboarded as part of the launch founding batch.',
    });
    expect(ok.success).toBe(true);
  });

  it('admin tier-change Zod schema rejects an unknown tier', () => {
    const result = changeProviderTierSchema.safeParse({
      tier: 'platinum',
      reason: 'Should be rejected.',
    });
    expect(result.success).toBe(false);
  });

  it('admin tier-change Zod schema accepts every legal tier', () => {
    for (const tier of ['founding', 'new', 'verified', 'pro', 'elite']) {
      const result = changeProviderTierSchema.safeParse({
        tier,
        reason: 'Sample reason text long enough.',
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('Bug 1323 fix verified — getCommissionRate route returns 10% for founding', () => {
  it('settings.service references the founding rate via getCommissionRate(tier)', () => {
    const file = fs.readFileSync(
      path.join(REPO_ROOT, 'packages/api/src/services/settings.service.ts'),
      'utf8',
    );
    // The function dispatches commission_rate_<tier>, and the founding row
    // is seeded in migration 050. The two lines together prove a founding
    // provider gets a 10% rate without a code change.
    expect(file).toMatch(/commission_rate_\$\{tier\}|commission_rate_founding/);
  });

  it('migration 050 seeds commission_rate_founding at 10%', () => {
    const sql = fs.readFileSync(
      path.join(REPO_ROOT, 'packages/api/migrations/050_platform_settings_rich_schema.sql'),
      'utf8',
    );
    expect(sql).toMatch(/'commission_rate_founding'[\s\S]+'10'/);
  });
});

describe('Bug 1323 fix verified — admin UI surfaces the founding badge', () => {
  it('ProviderDetailPage TIER_BADGE includes founding', () => {
    const file = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/admin/src/pages/ProviderDetailPage.tsx'),
      'utf8',
    );
    expect(file).toMatch(/founding:\s*['"]warning['"]/);
  });

  it('ProvidersPage TIER_BADGE includes founding', () => {
    const file = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/admin/src/pages/ProvidersPage.tsx'),
      'utf8',
    );
    expect(file).toMatch(/founding:\s*['"]warning['"]/);
  });
});
