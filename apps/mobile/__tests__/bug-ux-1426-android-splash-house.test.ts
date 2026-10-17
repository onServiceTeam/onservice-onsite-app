// Bug UX-1426: the Android start-up splash showed the logo far too small. The
// splash image was a tall 1284 x 2778 picture, and Expo SDK 55 draws the
// configured splash image inside a 200 dp square, so the tall picture shrank
// to a thin strip with the mark about 30 dp wide in the middle of the screen.
// It was also the retired slate "onService" text, not the house.
//
// Now the splash is a square, transparent image: the white tile with the
// brand-blue house (the on-blue version of the logo) filling 62.5% of the
// width, so the tile shows about 125 dp wide on the #003D9B background. The
// expo-splash-screen package is not installed, so its imageWidth option is not
// available; without it Expo uses this same 200 dp square for the top-level
// splash setting. The whole tile also stays inside the 192 dp circle Android
// 12+ uses for splash icons, in case the package is added later.
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
} from '../test-support/png';

const BRAND_BLUE = '#003D9B';
const RETIRED_SLATE = '#1B3A4B';

it('Bug UX-1426 — the Android splash is the square white house tile on brand blue, large enough to read', () => {
  const config = loadStandaloneAndroidConfig();
  expect(config.splash).toEqual({
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: BRAND_BLUE,
  });

  const splash = readMobileAsset('assets/splash-icon.png');
  expect(splash.width).toBe(splash.height);
  const size = splash.width;
  const centre = size / 2;

  // Transparent around the tile, so the configured blue shows behind it.
  expect(pixelAt(splash, 0, 0)[3]).toBe(0);
  expect(pixelAt(splash, size - 1, size - 1)[3]).toBe(0);

  // The tile spans at least 60% of the image width (at least 120 dp on screen).
  let minX = size;
  let maxX = -1;
  let slatePixels = 0;
  forEachPixel(splash, (rgba, x) => {
    if (rgba[3] === 0) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    if (colourDistance(rgba, RETIRED_SLATE) < 12) slatePixels++;
  });
  expect((maxX - minX + 1) / size).toBeGreaterThanOrEqual(0.6);
  expect(slatePixels).toBe(0);

  // Nothing would be cut off by Android 12+'s round splash-icon mask:
  // a 192 dp circle on the 200 dp image is a radius of 96/200 of the width.
  expect(farthestInkRadius(splash)).toBeLessThanOrEqual((size * 96) / 200);

  // White tile, brand-blue house (56% of the tile, centred).
  const tile = maxX - minX + 1;
  const houseBox = tile * 0.56;
  for (const point of Object.values(HOUSE_STROKE_POINTS)) {
    const [x, y] = housePoint(houseBox, centre, centre, point);
    expect(colourDistance(pixelAt(splash, x, y), BRAND_BLUE)).toBe(0);
  }
  for (const point of Object.values(HOUSE_OPEN_POINTS)) {
    const [x, y] = housePoint(houseBox, centre, centre, point);
    expect(pixelAt(splash, x, y)).toEqual([255, 255, 255, 255]);
  }
});
