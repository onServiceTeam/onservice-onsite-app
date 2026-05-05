// BUG-PHASE94-01 — founding tier present in every TIER_COLORS /
// TIER_LABELS / TIER_ICONS map across the mobile app.
//
// Pre-fix the founding tier (10% commission, invite-only launch
// batch) lived in:
//   - platformConfig.commissionRates ✓
//   - packages/api TIER_LADDER ✓
//   - packages/api/services/provider.service.ts TIER_LADDER ✓
// but was MISSING from every mobile screen's TIER_* map. As a result,
// every founding-batch provider (and any customer viewing one) saw:
//   - the tier badge in colors.textTertiary (grey) instead of a
//     distinctive color, and
//   - the raw lowercase string "founding" rendered as the label
//     because TIER_LABELS[tier] ?? tier fell through.
//
// Fix:
//   - apps/mobile/src/config/theme.ts: new `tierFounding` token (#0E7C7B).
//   - All five consumers (provider dashboard, provider profile tab,
//     customer provider detail, customer search, provider tier
//     progression) updated to include founding.
//   - tier-progression also gets a Crown icon (reused — founding is
//     the parallel premium tier outside the standard ladder).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const THEME = readFileSync(
  resolve(__dirname, '../src/config/theme.ts'),
  'utf8',
);
const DASHBOARD = readFileSync(
  resolve(__dirname, '../app/(provider-tabs)/dashboard.tsx'),
  'utf8',
);
const PROVIDER_TAB = readFileSync(
  resolve(__dirname, '../app/(provider-tabs)/provider-profile.tsx'),
  'utf8',
);
const PROVIDER_DETAIL = readFileSync(
  resolve(__dirname, '../app/customer/provider/[id].tsx'),
  'utf8',
);
const SEARCH = readFileSync(
  resolve(__dirname, '../app/customer/search.tsx'),
  'utf8',
);
const TIER_PROG = readFileSync(
  resolve(__dirname, '../app/provider/tier-progression.tsx'),
  'utf8',
);

describe('BUG-PHASE94-01 — founding tier wired into the mobile theme', () => {
  it('BUG-PHASE94-01 — theme.ts exposes a tierFounding color token', () => {
    expect(THEME).toMatch(/tierFounding:\s*'#[0-9A-Fa-f]{6}'/);
  });
});

describe('BUG-PHASE94-01 — every TIER_* consumer includes the founding tier', () => {
  it('BUG-PHASE94-01 — provider dashboard TIER_LABELS + TIER_COLORS include founding', () => {
    expect(DASHBOARD).toMatch(/founding:\s*'Founding'/);
    expect(DASHBOARD).toMatch(/founding:\s*colors\.tierFounding/);
  });

  it('BUG-PHASE94-01 — provider profile tab TIER_COLORS includes founding', () => {
    expect(PROVIDER_TAB).toMatch(/founding:\s*colors\.tierFounding/);
  });

  it('BUG-PHASE94-01 — customer provider detail TIER_COLORS + TIER_LABELS include founding', () => {
    expect(PROVIDER_DETAIL).toMatch(/founding:\s*colors\.tierFounding/);
    expect(PROVIDER_DETAIL).toMatch(/founding:\s*'Founding Provider'/);
  });

  it('BUG-PHASE94-01 — customer search TIER_LABELS includes founding', () => {
    expect(SEARCH).toMatch(/founding:\s*'Founding'/);
  });

  it('BUG-PHASE94-01 — tier-progression TIER_COLORS + TIER_ICONS include founding', () => {
    expect(TIER_PROG).toMatch(/founding:\s*colors\.tierFounding/);
    // Crown icon reused — comment in source must explain why.
    expect(TIER_PROG).toMatch(/founding:\s*Crown/);
  });
});
