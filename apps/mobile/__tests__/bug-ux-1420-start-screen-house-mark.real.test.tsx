// Bug UX-1420: the start screen (app/index.tsx, the first React screen on the
// phone and on the web after the system splash) showed the retired "oS"
// letters in a translucent circle above "onService". Ken (2026-10-14): the
// logo is the house everywhere. On a brand-blue background the logo is a
// white tile with a brand-blue house, and the wordmark is "onService PH" in
// one colour. The logo colours are the fixed brand values, so the expected
// colours are written out here rather than read from the app theme.
import React from 'react';
import { render, screen } from '@testing-library/react';

import StartScreen from '../app/index';

function cssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.color = value;
  return probe.style.color;
}

it('Bug UX-1420 — the start screen shows the white house tile and the one-colour "onService PH" wordmark, not "oS"', () => {
  render(<StartScreen />);

  expect(screen.queryByText('oS')).toBeNull();

  const tile = screen.getByTestId('start-brand-mark');
  expect(tile.style.backgroundColor).toBe(cssColor('#FFFFFF'));
  const house = tile.querySelector('[data-icon="Home"]');
  expect(house).not.toBeNull();
  expect(house!.getAttribute('color')).toBe('#003D9B');
  // House about 58% of the tile, the proportion of the approved sign-in panel.
  const share = Number(house!.getAttribute('size')) / Number.parseFloat(tile.style.width);
  expect(share).toBeGreaterThan(0.55);
  expect(share).toBeLessThan(0.6);

  const wordmark = screen.getByText('onService PH');
  expect(wordmark.style.color).toBe(cssColor('#FFFFFF'));
  expect(wordmark.querySelector('*')).toBeNull();
});
