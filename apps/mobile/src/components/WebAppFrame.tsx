// apps/mobile/src/components/WebAppFrame.tsx
//
// Phase 200 — responsive web shell.
//
// The onService app screens are designed for a phone (a single ~390-430px
// column). On a desktop browser that layout would stretch edge to edge across
// 1000-1900px, leaving service grids, cards, and the tab bar floating with huge
// gaps. That is the "mobile view stretched across the whole screen" problem.
//
// This frame fixes it the way mobile-first web apps normally do: on a wide
// browser it centers the whole app inside a phone-width column over a neutral
// backdrop, so it reads as an intentional app rather than a broken page. On a
// narrow browser (or an actual phone-sized window) it is full-bleed, and on
// native (iOS/Android) it is a pure passthrough — zero change to the app.
//
// The inner column establishes a positioning context (position: relative +
// overflow: hidden) so screens that anchor a bottom tab bar or a top banner
// with position:absolute / left:0 / right:0 anchor to the column, not the
// whole window.
import React from 'react';
import { Platform, View, StyleSheet, useWindowDimensions, Dimensions } from 'react-native';

// Widest phone-style column. Screens are laid out for ~390-430px, so 480 gives
// a little breathing room without distorting 3/4-column grids.
export const COLUMN_MAX_WIDTH = 480;
// Below this viewport width we go full-bleed (phones, small windows, split view).
const FULL_BLEED_BELOW = 560;

// The width screens should treat as "the app width" for sizing grids, pagers,
// and full-bleed images. On web this is clamped to the centered column so a
// wide browser window does not blow out phone-designed layouts; on native it is
// the real window width. Use this instead of Dimensions.get('window').width for
// any layout math.
export function getAppContentWidth(): number {
  const w = Dimensions.get('window').width;
  return Platform.OS === 'web' ? Math.min(w, COLUMN_MAX_WIDTH) : w;
}

export function WebAppFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const fullBleed = width < FULL_BLEED_BELOW;
  if (fullBleed) {
    return <View style={styles.fullBleed}>{children}</View>;
  }

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
});

export default WebAppFrame;
