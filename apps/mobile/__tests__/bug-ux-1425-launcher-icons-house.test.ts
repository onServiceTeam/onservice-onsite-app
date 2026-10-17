// Bug UX-1425: the Android launcher icons still showed the retired logo. Both
// icon.png and adaptive-icon.png were a white "oS" on slate #1B3A4B, and the
// adaptive foreground was opaque, so it hid the #003D9B background set in
// app.config.ts. There was no monochrome layer, so Android 13+ themed icons
// had nothing to draw. Ken (2026-10-14): the logo is the house, white on
// brand blue for launcher icons.
//
// Now: icon.png is full-bleed #003D9B with a white house; adaptive-icon.png is
// a white house on transparent over the #003D9B background colour; and
// android.adaptiveIcon.monochromeImage points at a one-colour house for themed
// icons. Android's own guide reuses the foreground drawable as the monochrome
// layer, and the foreground is already white on transparent, so the themed
// icon draws the same house shape as the normal one.
import { loadStandaloneAndroidConfig } from '../test-support/expo-config';
import {
  HOUSE_OPEN_POINTS,
  HOUSE_STROKE_POINTS,
  colourDistance,
  farthestInkRadius,
  forEachPixel,
  housePoint,
  pixelAt,
  readMobileAsset,
  type DecodedPng,
} from '../test-support/png';

const BRAND_BLUE = '#003D9B';
const RETIRED_SLATE = '#1B3A4B';

function countPixels(image: DecodedPng, test: (rgba: [number, number, number, number]) => boolean): number {
  let count = 0;
  forEachPixel(image, (rgba) => {
    if (test(rgba)) count++;
  });
  return count;
}

it('Bug UX-1425 — the launcher, adaptive and themed (monochrome) app icons are the white house on brand blue, not the slate "oS"', () => {
  const config = loadStandaloneAndroidConfig();
  expect(config.icon).toBe('./assets/icon.png');
  expect(config.android?.adaptiveIcon).toEqual({
    foregroundImage: './assets/adaptive-icon.png',
    backgroundColor: BRAND_BLUE,
    monochromeImage: './assets/adaptive-icon-monochrome.png',
  });

  // Legacy launcher icon (and the Expo default icon): opaque brand blue with a white house.
  const icon = readMobileAsset('assets/icon.png');
  expect([icon.width, icon.height]).toEqual([1024, 1024]);
  expect(countPixels(icon, (rgba) => rgba[3] !== 255)).toBe(0);
  expect(colourDistance(pixelAt(icon, 0, 0), BRAND_BLUE)).toBe(0);
  expect(countPixels(icon, (rgba) => colourDistance(rgba, RETIRED_SLATE) < 12)).toBe(0);
  const iconBox = 1024 * 0.52;
  for (const point of Object.values(HOUSE_STROKE_POINTS)) {
    const [x, y] = housePoint(iconBox, 512, 512, point);
    expect(colourDistance(pixelAt(icon, x, y), '#FFFFFF')).toBe(0);
  }
  for (const point of Object.values(HOUSE_OPEN_POINTS)) {
    const [x, y] = housePoint(iconBox, 512, 512, point);
    expect(colourDistance(pixelAt(icon, x, y), BRAND_BLUE)).toBe(0);
  }

  // Adaptive foreground and monochrome layer: one colour (white) on transparent,
  // the house drawn at the same place, inside Android's 66 of 108 dp safe circle.
  const foreground = readMobileAsset('assets/adaptive-icon.png');
  const monochrome = readMobileAsset('assets/adaptive-icon-monochrome.png');
  const safeRadius = (1024 * 33) / 108;
  const adaptiveBox = 1024 * 0.4;
  for (const layer of [foreground, monochrome]) {
    expect([layer.width, layer.height]).toEqual([1024, 1024]);
    expect(pixelAt(layer, 0, 0)[3]).toBe(0);
    expect(countPixels(layer, (rgba) => rgba[3] > 0 && (rgba[0] !== 255 || rgba[1] !== 255 || rgba[2] !== 255))).toBe(0);
    expect(farthestInkRadius(layer)).toBeLessThanOrEqual(safeRadius);
    for (const point of Object.values(HOUSE_STROKE_POINTS)) {
      const [x, y] = housePoint(adaptiveBox, 512, 512, point);
      expect(pixelAt(layer, x, y)[3]).toBe(255);
    }
    for (const point of Object.values(HOUSE_OPEN_POINTS)) {
      const [x, y] = housePoint(adaptiveBox, 512, 512, point);
      expect(pixelAt(layer, x, y)[3]).toBe(0);
    }
  }
  // The themed icon draws the same house shape as the normal adaptive icon.
  let alphaDifferences = 0;
  for (let i = 3; i < monochrome.pixels.length; i += 4) {
    if (monochrome.pixels[i] !== foreground.pixels[i]) alphaDifferences++;
  }
  expect(alphaDifferences).toBe(0);

  // The monochrome file is a real single-colour layer, not a copy of the colour icon.
  expect(monochrome.bytes.equals(icon.bytes)).toBe(false);
  expect(countPixels(monochrome, (rgba) => rgba[3] > 0 && colourDistance(rgba, BRAND_BLUE) < 60)).toBe(0);
});
