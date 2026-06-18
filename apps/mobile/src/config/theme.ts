/**
 * Design system tokens — onService brand.
 * Bug 1324 fix verified — primary brand color is #1B3A4B (deep teal),
 * sourced from docs/design-system/tokens.json. Static defaults below match
 * the canonical token values; runtime override via platform_settings is
 * deferred (LAUNCH-LIMITATIONS §brand-color-mobile-runtime).
 */
export const colors = {
  primary: '#1B3A4B',
  primaryDark: '#142D3B',
  primaryLight: '#E6EEF1',

  secondary: '#00B4D8',
  secondaryDark: '#0096B0',

  success: '#10B981',
  successLight: '#DEFBE6',
  successDark: '#047857',
  warning: '#F59E0B',
  warningLight: '#FCF4D6',
  warningDark: '#B45309',
  error: '#EF4444',
  errorLight: '#FFF1F1',
  info: '#0043CE',
  infoLight: '#EDF5FF',
  infoDark: '#1E40AF',
  white: '#FFFFFF',
  shadow: '#000000',

  text: '#1A1A2E',
  textSecondary: '#6B7280',
  // Darkened from #9CA3AF (only ~2.5:1 on white — failed WCAG AA) to #6E7480
  // (~4.7:1, passes AA for normal text). Used for captions, placeholders, and
  // fine print; a tester reported the light gray text was hard to read
  // (2026-06-16). Kept a touch lighter/cooler than textSecondary so the
  // de-emphasis hierarchy survives.
  textTertiary: '#6E7480',
  border: '#E5E7EB',
  divider: '#F3F4F6',
  background: '#FFFFFF',
  backgroundSecondary: '#F9FAFB',
  surface: '#FFFFFF',
  // App design refresh (2026-06) — the soft canvas a screen sits on so white
  // cards lift off the page. Use as a screen-root background; cards stay
  // `surface` (white) with a `border` hairline.
  surfaceMuted: '#F3F5F8',

  // BUG-PHASE94-01 — `founding` is the invite-only launch-batch tier
  // (10% commission). It existed in platformConfig.commissionRates and
  // packages/api TIER_LADDER but was never added to the mobile theme,
  // so all five screens that render the tier badge fell through to
  // colors.textTertiary (gray) and the raw lowercase string. Distinct
  // teal so it doesn't collide with elite/pro/verified.
  tierFounding: '#0E7C7B',
  tierNew: '#9CA3AF',
  tierVerified: '#3B82F6',
  tierPro: '#8B5CF6',
  tierElite: '#F59E0B',

  statusPending: '#F59E0B',
  statusConfirmed: '#1B3A4B',
  statusInProgress: '#10B981',
  statusCompleted: '#10B981',
  statusDisputed: '#EF4444',
  statusCancelled: '#9CA3AF',
} as const;

// App design refresh (2026-06) — soft per-category tints for service tiles,
// icon chips, and accents. Each pair is a light fill + its own dark-enough text
// color from the same family (passes contrast). Keyed by category slug; falls
// back to the brand teal for unknown categories. See getCategoryTint().
export const categoryTints: Record<string, { bg: string; fg: string }> = {
  cleaning: { bg: '#E1F5EE', fg: '#0F6E56' },
  aircon: { bg: '#E6F1FB', fg: '#185FA5' },
  'aircon-services': { bg: '#E6F1FB', fg: '#185FA5' },
  plumbing: { bg: '#FAEEDA', fg: '#854F0B' },
  electrical: { bg: '#FBEAF0', fg: '#993556' },
  carpentry: { bg: '#FAECE7', fg: '#993C1D' },
  painting: { bg: '#EEEDFE', fg: '#534AB7' },
  pest: { bg: '#EAF3DE', fg: '#3B6D11' },
  'pest-control': { bg: '#EAF3DE', fg: '#3B6D11' },
  appliance: { bg: '#E6F1FB', fg: '#185FA5' },
  'appliance-repair': { bg: '#E6F1FB', fg: '#185FA5' },
  moving: { bg: '#FAEEDA', fg: '#854F0B' },
  'general-maintenance': { bg: '#F1EFE8', fg: '#5F5E5A' },
};

export function getCategoryTint(slug?: string | null): { bg: string; fg: string } {
  const key = (slug ?? '').toLowerCase();
  return categoryTints[key] ?? { bg: colors.primaryLight, fg: colors.primary };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '400' as const, lineHeight: 16 },
  button: { fontSize: 16, fontWeight: '600' as const, lineHeight: 20 },
  price: { fontSize: 24, fontWeight: '700' as const, lineHeight: 30 },
  priceSmall: { fontSize: 16, fontWeight: '700' as const, lineHeight: 22 },
} as const;

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Typography = typeof typography;
export type BorderRadius = typeof borderRadius;
