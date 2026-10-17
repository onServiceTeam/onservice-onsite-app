// apps/mobile/src/components/BrandMark.tsx
//
// The onService PH logo tile (Ken, 2026-10-14): the house on a rounded
// square. One component so every screen draws the same mark; the rules live
// in docs/design-system/brand/README.md.
//
//   tone "onDark":  white tile, brand-blue house. Use on brand blue or dark
//                   backgrounds (sign-in brand panel, splash, onboarding).
//   tone "onLight": brand-blue tile, white house. Use on white or light
//                   backgrounds (desktop navigation rail, customer home).
//
// The colours are fixed brand values, not theme tokens: a later change to the
// app theme (for example colors.primary) must not recolour the logo. The admin
// app's BrandMark (apps/admin/src/components/BrandMark.tsx) uses the same two
// values. No orange and no slate in the mark.
//
// The house is the shared `Home` icon (lucide House), the same path as the
// static logo files and app icons. Proportions match the sign-in brand panel
// Ken approved: a 28 px house in a 48 px tile with a 6 px corner
// (borderRadius.md). For other tile sizes the house is rounded so the gap on
// each side of it is a whole pixel (24 px in a 40 px tile, not 23), the same
// rule as the admin BrandMark. Below 24 px the README asks for the house glyph
// on its own instead of a tile, so the tile never draws smaller than that.
//
// The tile is decorative: every use sits next to the "onService PH" wordmark,
// which carries the name for screen readers.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Home } from '@/components/icons';

/** Brand blue of the logo and of the wordmark on light backgrounds. */
export const BRAND_BLUE = '#003D9B';
/** White of the logo and of the wordmark on brand blue or dark backgrounds. */
export const BRAND_WHITE = '#FFFFFF';

export type BrandMarkTone = 'onDark' | 'onLight';

const TONES: Record<BrandMarkTone, { tile: string; house: string }> = {
  onDark: { tile: BRAND_WHITE, house: BRAND_BLUE },
  onLight: { tile: BRAND_BLUE, house: BRAND_WHITE },
};

const MIN_TILE_PX = 24;
const HOUSE_SHARE = 28 / 48;
const CORNER_SHARE = 6 / 48;

interface BrandMarkProps {
  tone: BrandMarkTone;
  /** Tile edge in px. Default 48, the sign-in brand panel size. */
  size?: number;
  testID?: string;
}

export default function BrandMark({ tone, size = 48, testID }: BrandMarkProps): React.ReactElement {
  const { tile, house } = TONES[tone];
  const edge = Math.max(MIN_TILE_PX, size);
  const inset = Math.round((edge - edge * HOUSE_SHARE) / 2);
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.flatten([
        styles.tile,
        {
          width: edge,
          height: edge,
          borderRadius: edge * CORNER_SHARE,
          backgroundColor: tile,
        },
      ])}
    >
      <Home size={edge - 2 * inset} color={house} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
