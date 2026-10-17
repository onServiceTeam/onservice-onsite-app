// UX-1400: the house in the admin sidebar's 40 px logo tile was drawn
// round(40 * 28 / 48) = 23 px wide. An odd house in an even tile is centred
// 8.5 px in, so on a normal (100% scale) monitor the house lines fall on half
// pixels and look soft. The house size is now rounded to an even number of
// pixels: 24 px in the 40 px tile (8 px in), and still 28 px in the 48 px
// sign-in tile, the size Ken approved in the phone app's sign-in panel.
// lucide draws on a 24-unit box with a 2-unit stroke, so at 24 px every
// straight house line sits on whole pixels.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import Sidebar from '../Sidebar';
import BrandMark from '../BrandMark';

function houseBox(tile: HTMLElement): { tile: number; house: number } {
  const houses = tile.querySelectorAll('svg');
  expect(houses).toHaveLength(1);
  const house = houses[0] as SVGSVGElement;
  expect(house.getAttribute('class')).toContain('lucide-house');
  const width = Number(house.getAttribute('width'));
  expect(house.getAttribute('height')).toBe(String(width));
  return { tile: Number.parseFloat(tile.style.width), house: width };
}

it('Bug UX-1400 — the sidebar logo house is 24 px in its 40 px tile, so it sits on whole pixels', () => {
  // Expanded and collapsed sidebar: the real Sidebar renders a 40 px tile.
  for (const collapsed of [false, true]) {
    const view = render(<MemoryRouter><Sidebar collapsed={collapsed} /></MemoryRouter>);
    const { tile, house } = houseBox(screen.getByTestId('brand-mark'));
    expect(tile).toBe(40);
    expect(house).toBe(24);
    // Centred with a whole-pixel inset on every side (8 px), not 8.5 px.
    expect(Number.isInteger((tile - house) / 2)).toBe(true);
    view.unmount();
  }

  // The 48 px sign-in tile keeps the approved 28 px house.
  const signIn = render(<BrandMark tone="onDark" size={48} />);
  expect(houseBox(screen.getByTestId('brand-mark'))).toEqual({ tile: 48, house: 28 });
  signIn.unmount();
});
