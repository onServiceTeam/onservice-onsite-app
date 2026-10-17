import React from 'react';
import { Home } from '@/components/icons';

/**
 * The onService PH logo tile: the lucide house on a rounded square.
 *
 * Ken, 2026-10-14: the logo is the house, the same one the phone app shows in
 * its sign-in brand panel (apps/mobile/src/components/AuthBrandPanel.tsx). The
 * rules live in docs/design-system/brand/README.md:
 *   - onLight: brand blue #003D9B tile, white house. For white or light
 *     backgrounds (the sidebar, the compact sign-in header).
 *   - onDark: white tile, brand blue house. For the brand blue sign-in panel.
 *   - The colours are fixed brand values, not theme tokens, and never orange.
 *   - Geometry matches the phone panel: a 28 px house in a 48 px tile with a
 *     6 px corner, scaled for other tile sizes. The house keeps lucide's own
 *     stroke (2 on its 24-unit box), scaled with the house.
 *   - UX-1400: the house size is rounded so the gap on each side of it is a
 *     whole pixel (24 px in the 40 px sidebar tile, not 23). An odd house in
 *     an even tile sits on half pixels and looks soft on a 100% scale screen.
 *
 * The tile is decorative when the "onService PH" wordmark is on screen next to
 * it. Pass `label` where the tile stands alone (the collapsed sidebar rail) so
 * screen readers still hear the name.
 */

export const BRAND_BLUE = '#003D9B';
export const BRAND_WHITE = '#FFFFFF';
const MIN_TILE_PX = 24;

export type BrandMarkTone = 'onLight' | 'onDark';

export interface BrandMarkProps {
  tone: BrandMarkTone;
  /** Tile edge in px. The brand README sets 24 px as the smallest tile. */
  size?: number;
  /** Accessible name when no wordmark is visible next to the tile. */
  label?: string;
  testId?: string;
}

export default function BrandMark({
  tone,
  size = 40,
  label,
  testId = 'brand-mark',
}: BrandMarkProps): React.ReactElement {
  const tile = Math.max(MIN_TILE_PX, size);
  const inset = Math.round((tile - (tile * 28) / 48) / 2);
  const glyph = tile - 2 * inset;
  const radius = (tile * 6) / 48;
  const tileColour = tone === 'onLight' ? BRAND_BLUE : BRAND_WHITE;
  const houseColour = tone === 'onLight' ? BRAND_WHITE : BRAND_BLUE;
  const accessibility = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: tile, height: tile, borderRadius: radius, backgroundColor: tileColour }}
      data-testid={testId}
      data-tone={tone}
      {...accessibility}
    >
      <Home size={glyph} color={houseColour} aria-hidden="true" focusable="false" />
    </span>
  );
}
