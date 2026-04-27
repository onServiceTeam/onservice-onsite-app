/**
 * Accessibility configuration for onService mobile app.
 * WCAG 2.1 Level AA compliance, NFR-006.
 *
 * High-contrast color palette, minimum touch targets,
 * font scaling constraints, and colorblind-safe mappings.
 */
import { AccessibilityInfo } from 'react-native';
import { colors as defaultColors } from './theme';

export const MIN_TOUCH_TARGET = 44;

export const FONT_SCALE = {
  min: 1.0,
  max: 2.0,
  default: 1.0,
} as const;

/**
 * High-contrast color palette — meets WCAG AA 4.5:1 contrast ratio
 * for normal text, 3:1 for large text against white/dark backgrounds.
 */
export const highContrastColors = {
  ...defaultColors,
  primary: '#003DA5',
  primaryDark: '#002B75',
  primaryLight: '#CCE0FF',

  text: '#000000',
  textSecondary: '#333333',
  textTertiary: '#555555',
  border: '#999999',
  divider: '#CCCCCC',
  background: '#FFFFFF',
  backgroundSecondary: '#F0F0F0',
  surface: '#FFFFFF',

  success: '#006B3F',
  warning: '#8A6500',
  error: '#C41E3A',
  info: '#003DA5',

  statusPending: '#8A6500',
  statusConfirmed: '#003DA5',
  statusInProgress: '#006B3F',
  statusCompleted: '#006B3F',
  statusDisputed: '#C41E3A',
  statusCancelled: '#555555',
} as const;

/**
 * Colorblind-safe status indicator icons to pair with colors.
 * Ensures status is distinguishable without relying solely on color.
 */
export const statusIndicators: Record<string, { icon: string; label: string }> = {
  pending: { icon: '⏳', label: 'Pending' },
  confirmed: { icon: '✓', label: 'Confirmed' },
  inProgress: { icon: '▶', label: 'In Progress' },
  completed: { icon: '✓✓', label: 'Completed' },
  disputed: { icon: '!', label: 'Disputed' },
  cancelled: { icon: '✕', label: 'Cancelled' },
};

export function announceForAccessibility(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}

export function isReduceMotionEnabled(): Promise<boolean> {
  return AccessibilityInfo.isReduceMotionEnabled();
}

export function isScreenReaderEnabled(): Promise<boolean> {
  return AccessibilityInfo.isScreenReaderEnabled();
}

export function ensureMinTouchTarget(size: number): number {
  return Math.max(size, MIN_TOUCH_TARGET);
}

/**
 * Clamp font size for accessibility scaling.
 * Prevents text from becoming too large on extreme settings.
 */
export function clampFontScale(
  baseSize: number,
  scale: number,
): number {
  const clamped = Math.min(Math.max(scale, FONT_SCALE.min), FONT_SCALE.max);
  return Math.round(baseSize * clamped);
}
