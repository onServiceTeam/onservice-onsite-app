// apps/mobile/src/hooks/useResponsive.ts
//
// Reactive responsive info for screens. Re-computes on window resize/rotate so a
// browser window dragged between phone/tablet/desktop widths reflows live.
import { useWindowDimensions, Platform } from 'react-native';
import {
  resolveLayout,
  getForcedView,
  byBreakpoint,
  type Breakpoint,
  type ResponsiveInfo,
  TABLET_MIN_WIDTH,
  DESKTOP_MIN_WIDTH,
} from '@/utils/responsive';

export type { Breakpoint, ResponsiveInfo };
export { byBreakpoint };

export function useResponsive(): ResponsiveInfo {
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web') {
    // Native: real device width. Phones are 'phone'; large tablets get the
    // roomier layouts via 'tablet'/'desktop'.
    const bp: Breakpoint =
      width >= DESKTOP_MIN_WIDTH ? 'desktop' : width >= TABLET_MIN_WIDTH ? 'tablet' : 'phone';
    return {
      width,
      breakpoint: bp,
      isPhone: bp === 'phone',
      isTablet: bp === 'tablet',
      isDesktop: bp === 'desktop',
    };
  }

  return resolveLayout(width, getForcedView());
}
