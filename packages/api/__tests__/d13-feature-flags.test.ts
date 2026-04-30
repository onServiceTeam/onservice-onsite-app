// Phase 14 Dispatch 13 — A/B testing + promo redemption pull bridge test.
//
// ─── Bug manifest ─────────────────────────────────────────────────────
// Bug 44  — promo codes can be created but never redeemed (pulled v1.0)
// Bug 45  — A/B test framework infrastructure exists but no assignment (pulled v1.0)
// Bug 152 — promo creation form needs guidance banner explaining unwired
// Bug 286 — A/B Tests admin tab hidden until wiring lands in v1.1
// ──────────────────────────────────────────────────────────────────────
//
// D13 ships the feature-flag mechanism (platform_settings rows seeded
// FALSE, server exposes via getClientConfig().featureFlags, mobile + admin
// useFeatureFlags hooks read them, admin UI conditionally renders).
//
// Static-content tests assert the wiring landed; integration is verified
// by code review + the existing platform_settings infrastructure tests.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..');

function source(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf-8');
}

function exists(relPath: string): boolean {
  return existsSync(join(REPO_ROOT, relPath));
}

describe('D13 Bug 44 — promo redemption pulled for v1.0', () => {
  it('Bug 44 — feature-flag migration seeded FALSE for promo_redemption_enabled', () => {
    expect(exists('packages/api/migrations/088_d13_feature_flags.sql')).toBe(true);
    const sql = source('packages/api/migrations/088_d13_feature_flags.sql');
    expect(sql).toMatch(/feature_flag\.promo_redemption_enabled/);
    expect(sql).toMatch(/'false'/);
    expect(sql).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
  });

  it('Bug 44 — server getClientConfig surfaces featureFlags to mobile', () => {
    const svc = source('packages/api/src/services/settings.service.ts');
    expect(svc).toMatch(/getFeatureFlags/);
    expect(svc).toMatch(/promoRedemptionEnabled/);
    expect(svc).toMatch(/featureFlags/);
  });

  it('Bug 44 — mobile useFeatureFlags hook exists and defaults OFF', () => {
    expect(exists('apps/mobile/src/hooks/useFeatureFlags.ts')).toBe(true);
    const hook = source('apps/mobile/src/hooks/useFeatureFlags.ts');
    expect(hook).toMatch(/promoRedemptionEnabled: false/);
    expect(hook).toMatch(/abTestingEnabled: false/);
    expect(hook).toMatch(/DEFAULT_FLAGS/);
  });
});

describe('D13 Bug 45 — A/B testing pulled for v1.0', () => {
  it('Bug 45 — feature-flag migration seeded FALSE for ab_testing_enabled', () => {
    const sql = source('packages/api/migrations/088_d13_feature_flags.sql');
    expect(sql).toMatch(/feature_flag\.ab_testing_enabled/);
  });

  it('Bug 45 — admin useFeatureFlags hook exists', () => {
    expect(exists('apps/admin/src/hooks/useFeatureFlags.ts')).toBe(true);
    const hook = source('apps/admin/src/hooks/useFeatureFlags.ts');
    expect(hook).toMatch(/abTestingEnabled/);
    expect(hook).toMatch(/promoRedemptionEnabled/);
  });
});

describe('D13 Bug 152 — promo banner explaining unwired', () => {
  it('Bug 152 — MarketingPage Promo Codes tab renders unwired banner when flag is OFF', () => {
    const page = source('apps/admin/src/pages/MarketingPage.tsx');
    expect(page).toMatch(/promo-not-wired-banner/);
    expect(page).toMatch(/!flags\.promoRedemptionEnabled/);
    expect(page).toMatch(/redemption pipeline/);
  });

  it('Bug 152 — useFeatureFlags imported into MarketingPage', () => {
    const page = source('apps/admin/src/pages/MarketingPage.tsx');
    expect(page).toMatch(/import.*useFeatureFlags/);
  });
});

describe('D13 Bug 286 — A/B Tests admin tab hidden when flag is OFF', () => {
  it('Bug 286 — AnalyticsPage filters tabs by feature flag', () => {
    const page = source('apps/admin/src/pages/AnalyticsPage.tsx');
    expect(page).toMatch(/useFeatureFlags/);
    expect(page).toMatch(/ALL_TABS/);
    expect(page).toMatch(/!t\.flag \|\| flags\[t\.flag\]/);
  });

  it('Bug 286 — A/B Tests tab is gated on abTestingEnabled flag', () => {
    const page = source('apps/admin/src/pages/AnalyticsPage.tsx');
    expect(page).toMatch(/'ab-tests'.*'A\/B Tests'.*flag: 'abTestingEnabled'/);
  });
});

describe('D13 decision document', () => {
  it('Bug 44, 45 — D13 decisions recorded with Pull choice', () => {
    expect(exists('.ai-coder/decisions/D13-feature-decisions.md')).toBe(true);
    const doc = source('.ai-coder/decisions/D13-feature-decisions.md');
    expect(doc).toMatch(/Bug 44/);
    expect(doc).toMatch(/Bug 45/);
    expect(doc).toMatch(/Pull for v1\.0/);
  });
});
