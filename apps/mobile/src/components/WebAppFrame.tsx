// apps/mobile/src/components/WebAppFrame.tsx
//
// Phase 200 — responsive web shell. Updated 2026-06-28 to support an explicit
// desktop view for browser testing.
//
// The onService app screens are designed for a phone (a single ~390-430px
// column). Three web layouts are supported:
//
//   • mobile  (default on wide browsers): the app is centered in a phone-width
//     column over a neutral backdrop, so it reads as an intentional app rather
//     than a stretched page. This is the "mobile type version".
//   • desktop (?view=desktop): the app expands to a real desktop content width
//     (up to ~1024px). Screens that size grids/pagers from getAppContentWidth()
//     reflow to more columns, so it reads as a desktop web app, not a blown-up
//     phone. This is the "desktop version".
//   • full-bleed: on an actual phone-sized window (< 560px) the app fills the
//     viewport. Native (iOS/Android) is a pure passthrough — zero change.
//
// The chosen view comes from the ?view=desktop|mobile URL param and is persisted
// in localStorage so it survives the splash screen's router.replace() (which
// drops the query string once it routes into the app).
import React from 'react';
import { Platform, View, StyleSheet, useWindowDimensions, Dimensions } from 'react-native';

// Widest phone-style column. Screens are laid out for ~390-430px, so 480 gives
// a little breathing room without distorting 3/4-column grids.
export const COLUMN_MAX_WIDTH = 480;
// Desktop content width. Wide enough that grids reflow to more columns and the
// app uses the screen, capped so it never stretches absurdly on ultra-wide
// monitors.
export const DESKTOP_MAX_WIDTH = 1024;
// Below this viewport width we go full-bleed (phones, small windows, split view).
const FULL_BLEED_BELOW = 560;

const VIEW_KEY = 'onservice.view';

// Read the forced view (web only): ?view=desktop|mobile wins and is remembered;
// otherwise the last remembered choice; otherwise null (default behaviour).
export function getForcedView(): 'mobile' | 'desktop' | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('view');
    if (fromUrl === 'desktop' || fromUrl === 'mobile') {
      window.localStorage.setItem(VIEW_KEY, fromUrl);
      return fromUrl;
    }
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === 'desktop' || saved === 'mobile') return saved;
  } catch {
    /* localStorage unavailable (private mode) — fall through to default */
  }
  return null;
}

// The width screens should treat as "the app width" for sizing grids, pagers,
// and full-bleed images. On web this is clamped to the active column width so a
// wide browser window does not blow out phone-designed layouts; on native it is
// the real window width. Use this instead of Dimensions.get('window').width for
// any layout math.
export function getAppContentWidth(): number {
  const w = Dimensions.get('window').width;
  if (Platform.OS !== 'web') return w;
  const view = getForcedView();
  if (view === 'desktop') return Math.min(w, DESKTOP_MAX_WIDTH);
  return Math.min(w, COLUMN_MAX_WIDTH);
}

export function WebAppFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const view = getForcedView();

  // Desktop view — roomy centered column on a light backdrop.
  if (view === 'desktop') {
    return (
      <View style={styles.desktopBackdrop}>
        <View style={[styles.column, styles.desktopColumn]}>{children}</View>
      </View>
    );
  }

  // Genuinely small viewport (real phone / narrow window) — fill it, unless the
  // tester explicitly forced the phone-column "mobile" view.
  const fullBleed = width < FULL_BLEED_BELOW && view !== 'mobile';
  if (fullBleed) {
    return <View style={styles.fullBleed}>{children}</View>;
  }

  // Default + forced "mobile": centered phone-width column on a dark backdrop.
  return (
    <View style={styles.backdrop}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullBleed: { flex: 1 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    // Neutral slate backdrop on the empty sides so the centered column reads as
    // a device, not a misaligned page.
    backgroundColor: '#0f1b24',
  },
  desktopBackdrop: {
    flex: 1,
    alignItems: 'center',
    // Lighter backdrop for the desktop layout so it reads as a web app surface.
    backgroundColor: '#E9EEF3',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: COLUMN_MAX_WIDTH,
    backgroundColor: '#FFFFFF',
    // Establish a positioning context for screens' absolutely-positioned
    // tab bars / banners, and clip anything that would overflow the column.
    position: 'relative',
    overflow: 'hidden',
    // Subtle elevation so the column lifts off the backdrop on desktop.
    ...Platform.select({
      web: {
        boxShadow: '0 0 40px rgba(0,0,0,0.25)',
      },
      default: {},
    }),
  },
  desktopColumn: {
    maxWidth: DESKTOP_MAX_WIDTH,
  },
});

export default WebAppFrame;
