// Bug UX-1432: the logo jumped when the app started. The Android splash
// (app.config.ts: splash-icon.png on #003D9B) shows the white house tile about
// 125 dp wide, centred on the screen: Expo SDK 55 draws the top-level splash
// image inside a 200 dp square (@expo/prebuild-config getAndroidSplashConfig,
// imageWidth 200), and the tile fills 62.5% of that image. The first React
// screen (app/index.tsx) then drew the tile at 112 px and higher up, stacked
// above the wordmark and tagline, so the logo shrank and moved up at the
// hand-off, although its comment said it followed the splash tile.
//
// Now the start screen draws the tile at the splash tile's size, as the only
// item in the layout flow, so it sits at the screen centre like the splash
// tile, on the same fixed splash blue. The wordmark and tagline are placed
// below it, outside the flow. The tile size comes from the real splash image
// here, so regenerating splash-icon.png at another size fails this test until
// app/index.tsx follows. Not yet seen on a device: check the hand-off on the
// emulator or a phone with the next APK.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { loadStandaloneAndroidConfig } from '../test-support/expo-config';
import { forEachPixel, readMobileAsset } from '../test-support/png';

import StartScreen from '../app/index';

const EXPO_SPLASH_IMAGE_DP = 200;

function cssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = value;
  return probe.style.backgroundColor;
}

it('Bug UX-1432 — the start screen draws the logo tile at the splash tile size, alone at the screen centre, on the splash blue', () => {
  const config = loadStandaloneAndroidConfig();
  const splashImage = config.splash?.image;
  const splashBlue = config.splash?.backgroundColor;
  expect(splashImage).toBeDefined();
  expect(splashBlue).toBe('#003D9B');

  // Width of the tile as the splash shows it, in dp.
  const splash = readMobileAsset(splashImage!.replace(/^\.\//, ''));
  let minX = splash.width;
  let maxX = -1;
  forEachPixel(splash, (rgba, x) => {
    if (rgba[3] === 0) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  });
  const splashTileDp = ((maxX - minX + 1) / splash.width) * EXPO_SPLASH_IMAGE_DP;

  render(<StartScreen />);

  const root = screen.getByTestId('start-screen');
  expect(root.style.backgroundColor).toBe(cssColor(splashBlue!));
  expect(root.style.justifyContent).toBe('center');
  expect(root.style.alignItems).toBe('center');
  expect(root.style.paddingTop).toBe('');

  const tile = screen.getByTestId('start-brand-mark');
  expect(Math.abs(Number.parseFloat(tile.style.width) - splashTileDp)).toBeLessThanOrEqual(1);
  expect(tile.style.backgroundColor).toBe(cssColor('#FFFFFF'));

  // The tile is the only child of the screen in the layout flow, so it is centred.
  expect(tile.parentElement).toBe(root);
  for (const child of Array.from(root.children) as HTMLElement[]) {
    if (child !== tile) expect(child.style.position).toBe('absolute');
  }

  // The wordmark and tagline start below the tile, with the brand README's
  // clear space (25% of the tile) between them.
  const block = screen.getByTestId('start-wordmark-block');
  expect(block.style.top).toBe('50%');
  expect(Number.parseFloat(block.style.marginTop)).toBeGreaterThanOrEqual(splashTileDp / 2 + splashTileDp * 0.25);
  expect(block.textContent).toContain('onService PH');
  expect(block.textContent).toContain('Home services, done right.');
});
