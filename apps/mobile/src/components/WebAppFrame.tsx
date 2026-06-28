// apps/mobile/src/components/WebAppFrame.tsx
//
// Responsive web shell. AUTO-adapts to the real window width across phone,
// tablet, and desktop (see src/utils/responsive.ts) — no manual ?view needed,
// though ?view=mobile|desktop still force-overrides for testing. Native
// (iOS/Android) is a pure passthrough — zero change.
//
//   • phone  (< 700px): the app fills the viewport (mobile web).
//   • tablet (700-999px): a centered app surface (up to 760px) on a light backdrop.
//   • desktop (>= 1000px): a real desktop surface (up to 1100px) where screens
//     that use useResponsive()/getAppContentWidth() reflow to more columns.
import React from 'react';
import { Platform, View, StyleSheet, useWindowDimensions } from 'react-native';
import {
  resolveLayout,
  getForcedView,
  getAppContentWidth as resolveContentWidth,
  PHONE_COLUMN_MAX_WIDTH,
  DESKTOP_CONTENT_MAX_WIDTH,
} from '@/utils/responsive';

// Backward-compatible re-exports (existing imports point at WebAppFrame).
export { getForcedView } from '@/utils/responsive';
export const COLUMN_MAX_WIDTH = PHONE_COLUMN_MAX_WIDTH;
export const DESKTOP_MAX_WIDTH = DESKTOP_CONTENT_MAX_WIDTH;
export function getAppContentWidth(): number {
  return resolveContentWidth();
}

export function WebAppFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const layout = resolveLayout(width, getForcedView());

  // Phone width (or forced mobile on a wide screen): forced-mobile shows the
  // phone column on a dark backdrop; a genuinely small window fills the viewport.
  if (layout.breakpoint === 'phone') {
    if (getForcedView() === 'mobile') {
      return (
        <View style={styles.backdrop}>
          <View style={[styles.column, { maxWidth: PHONE_COLUMN_MAX_WIDTH }]}>{children}</View>
        </View>
      );
    }
    return <View style={styles.fullBleed}>{children}</View>;
  }

  // Tablet / desktop: a centered app surface sized to the breakpoint on a light
  // backdrop so it reads as a web app, not a stretched phone.
  return (
    <View style={styles.surfaceBackdrop}>
      <View style={[styles.column, { maxWidth: layout.width }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullBleed: { flex: 1 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#0f1b24',
  },
  surfaceBackdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#E9EEF3',
  },
  column: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
    position: 'relative',
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 0 40px rgba(0,0,0,0.25)' },
      default: {},
    }),
  },
});

export default WebAppFrame;
