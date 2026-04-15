import { useMemo } from 'react';
import { colors as defaultColors, type Colors } from '../config/theme';
import { highContrastColors, announceForAccessibility } from '../config/accessibility';
import { useAccessibilityStore } from '../stores/accessibility.store';

type ColorPalette = { [K in keyof Colors]: string };

/**
 * Hook that provides the correct color palette based on accessibility preferences,
 * scaled font sizes, and screen reader announcement utilities.
 */
export function useAccessibility(): {
  colors: ColorPalette;
  fontScale: number;
  reduceMotion: boolean;
  highContrast: boolean;
  scaledFontSize: (base: number) => number;
  announce: (message: string) => void;
} {
  const { highContrastEnabled, reduceMotionEnabled, fontScale } = useAccessibilityStore();

  const colors: ColorPalette = useMemo(
    () => (highContrastEnabled ? highContrastColors : defaultColors),
    [highContrastEnabled],
  );

  const scaledFontSize = useMemo(
    () => (base: number): number => Math.round(base * fontScale),
    [fontScale],
  );

  return {
    colors,
    fontScale,
    reduceMotion: reduceMotionEnabled,
    highContrast: highContrastEnabled,
    scaledFontSize,
    announce: announceForAccessibility,
  };
}
