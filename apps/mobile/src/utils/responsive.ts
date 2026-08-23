// apps/mobile/src/utils/responsive.ts
//
// Single source of truth for the app's responsive behaviour across phone,
// tablet, and desktop. Pure (no React) so both the WebAppFrame shell and the
// useResponsive() hook can share it without a circular import.
//
// The web app now AUTO-adapts to the real window width (no manual ?view needed):
//   • phone  (< 700px window): the app fills the viewport (mobile web).
//   • tablet (700-999px): a comfortable centered surface (up to 920px).
//   • desktop (>= 1000px): content may grow to 1100px. At 1180px the web
//     shell also adds persistent role-aware navigation beside that content.
// A ?view=mobile|desktop URL param still force-overrides the current URL for
// testing. It is deliberately not persisted: a test link must never leave a
// real customer or provider stuck in phone mode on later visits.
import { Platform, Dimensions } from 'react-native';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

// Window-width thresholds that switch breakpoint.
export const TABLET_MIN_WIDTH = 700;
export const DESKTOP_MIN_WIDTH = 1000;

// How wide the app's content surface is allowed to grow at each breakpoint.
export const PHONE_COLUMN_MAX_WIDTH = 480; // forced-mobile phone column on wide screens
export const TABLET_CONTENT_MAX_WIDTH = 920;
export const DESKTOP_CONTENT_MAX_WIDTH = 1100;
export const DESKTOP_SHELL_MIN_WIDTH = 1180;
export const DESKTOP_SHELL_MAX_WIDTH = 1320;

/** Web-only forced view from the current ?view=desktop|mobile query string. */
export function getForcedView(): 'mobile' | 'desktop' | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('view');
    if (fromUrl === 'desktop' || fromUrl === 'mobile') return fromUrl;
  } catch {
    /* Malformed or unavailable location state: fall through to auto layout. */
  }
  return null;
}

export interface ResponsiveInfo {
  /** The width the app's content actually renders in (already capped to the surface). */
  width: number;
  breakpoint: Breakpoint;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

function info(width: number, breakpoint: Breakpoint): ResponsiveInfo {
  return {
    width,
    breakpoint,
    isPhone: breakpoint === 'phone',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
  };
}

/**
 * Resolve content width + breakpoint from a raw window width. On native the app
 * uses the real device width (phone, or tablet on big devices). On web it
 * auto-adapts by width unless a ?view override is set.
 */
export function resolveLayout(
  windowWidth: number,
  forcedView: 'mobile' | 'desktop' | null,
): ResponsiveInfo {
  if (forcedView === 'mobile') return info(Math.min(windowWidth, PHONE_COLUMN_MAX_WIDTH), 'phone');
  if (forcedView === 'desktop')
    return info(Math.min(windowWidth, DESKTOP_CONTENT_MAX_WIDTH), 'desktop');
  if (windowWidth < TABLET_MIN_WIDTH) return info(windowWidth, 'phone');
  if (windowWidth < DESKTOP_MIN_WIDTH)
    return info(Math.min(windowWidth, TABLET_CONTENT_MAX_WIDTH), 'tablet');
  return info(Math.min(windowWidth, DESKTOP_CONTENT_MAX_WIDTH), 'desktop');
}

/** Non-hook content width for layout math in places that can't use the hook. */
export function getAppContentWidth(): number {
  const w = Dimensions.get('window').width;
  if (Platform.OS !== 'web') return w;
  return resolveLayout(w, getForcedView()).width;
}

/** Pick a value per breakpoint (e.g. column counts, gutters). */
export function byBreakpoint<T>(bp: Breakpoint, opts: { phone: T; tablet: T; desktop: T }): T {
  return bp === 'desktop' ? opts.desktop : bp === 'tablet' ? opts.tablet : opts.phone;
}
