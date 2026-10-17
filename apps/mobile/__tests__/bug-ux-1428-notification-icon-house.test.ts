// Bug UX-1428: the Android push-notification icon (status bar and
// notification shade) was a white "oS". Ken (2026-10-14): the logo is the
// house everywhere. Android draws the small notification icon from its alpha
// channel only and tints it, so it must be one colour on transparent with no
// tile (a tile would show as a solid square).
//
// Now notification-icon.png is the lucide house alone, white on transparent,
// 96 x 96 (24 dp at xxxhdpi), and the expo-notifications plugin still tints
// it brand blue.
import { loadStandaloneAndroidConfig, pluginOptions } from '../test-support/expo-config';
import {
  HOUSE_OPEN_POINTS,
  HOUSE_STROKE_POINTS,
  forEachPixel,
  housePoint,
  pixelAt,
  readMobileAsset,
} from '../test-support/png';

it('Bug UX-1428 — the push-notification icon is the white house silhouette on transparent, not "oS"', () => {
  expect(pluginOptions(loadStandaloneAndroidConfig(), 'expo-notifications')).toEqual({
    icon: './assets/notification-icon.png',
    color: '#003D9B',
  });

  const icon = readMobileAsset('assets/notification-icon.png');
  expect([icon.width, icon.height]).toEqual([96, 96]);

  // One colour: every visible pixel is pure white; everything else is transparent.
  let coloured = 0;
  let visible = 0;
  forEachPixel(icon, (rgba) => {
    if (rgba[3] === 0) return;
    visible++;
    if (rgba[0] !== 255 || rgba[1] !== 255 || rgba[2] !== 255) coloured++;
  });
  expect(coloured).toBe(0);
  expect(visible).toBeGreaterThan(0);
  expect(pixelAt(icon, 0, 0)[3]).toBe(0);

  // The house: walls, door posts and floor drawn; door and room left open.
  for (const point of Object.values(HOUSE_STROKE_POINTS)) {
    const [x, y] = housePoint(96, 48, 48, point);
    expect(pixelAt(icon, x, y)[3]).toBe(255);
  }
  for (const point of Object.values(HOUSE_OPEN_POINTS)) {
    const [x, y] = housePoint(96, 48, 48, point);
    expect(pixelAt(icon, x, y)[3]).toBe(0);
  }
});
