/**
 * Design system tokens — onService brand.
 * All colors, spacing, typography, and border radius values.
 * Import this everywhere instead of hardcoding values.
 */
export const colors = {
  primary: '#0066FF',
  primaryDark: '#0052CC',
  primaryLight: '#E6F0FF',

  secondary: '#00C48C',
  secondaryDark: '#00A376',

  success: '#00C48C',
  successLight: '#ECFDF5',
  successDark: '#047857',
  warning: '#FFB800',
  warningLight: '#FFFBEB',
  warningDark: '#B45309',
  error: '#FF3B3B',
  errorLight: '#FEF2F2',
  info: '#0066FF',
  infoLight: '#EFF6FF',
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

  statusPending: '#FFB800',
  statusConfirmed: '#0066FF',
  statusInProgress: '#00C48C',
  statusCompleted: '#00C48C',
  statusDisputed: '#FF3B3B',
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
