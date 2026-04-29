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
  textTertiary: '#9CA3AF',
  border: '#E5E7EB',
  divider: '#F3F4F6',
  background: '#FFFFFF',
  backgroundSecondary: '#F9FAFB',
  surface: '#FFFFFF',

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
