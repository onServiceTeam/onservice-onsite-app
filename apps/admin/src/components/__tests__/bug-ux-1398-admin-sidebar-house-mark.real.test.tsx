// UX-1398 (Ken, 2026-10-14): the onService PH logo is the house, the same
// mark as the phone app's sign-in panel. The admin sidebar still showed a blue
// tile with the TEXT "oS" on every signed-in page. The sidebar sits on a white
// background, so the brand rule (docs/design-system/brand/README.md) is a
// #003D9B tile with a white lucide house, next to "onService PH" in one colour.
// This renders the real Sidebar in its three shapes: the expanded desktop
// sidebar, the collapsed rail (tile alone) and the phone drawer.
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import Sidebar from '../Sidebar';

// The two path strings of the lucide 0.456.0 "house" icon, copied from the
// brand rulebook (docs/design-system/brand/README.md, "do not redraw").
const HOUSE_PATHS = [
  'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
  'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
];

function expectBlueTileWithWhiteHouse(tile: HTMLElement): void {
  expect(tile.textContent).toBe('');
  expect(tile.style.backgroundColor).toBe('rgb(0, 61, 155)');
  expect(tile.style.width).toBe('40px');
  expect(tile.style.height).toBe('40px');
  const houses = tile.querySelectorAll('svg');
  expect(houses).toHaveLength(1);
  const house = houses[0] as SVGSVGElement;
  expect(house.getAttribute('class')).toContain('lucide-house');
  expect(house.getAttribute('stroke')).toBe('#FFFFFF');
  expect(house.getAttribute('stroke-width')).toBe('2');
  expect(house.getAttribute('viewBox')).toBe('0 0 24 24');
  expect(house.getAttribute('fill')).toBe('none');
  expect(Array.from(house.querySelectorAll('path')).map((path) => path.getAttribute('d'))).toEqual(HOUSE_PATHS);
  expect(tile.outerHTML).not.toMatch(/#fe8a00|#ff8a00|color-accent|orange/i);
}

it('Bug UX-1398 — the admin sidebar logo is the white house on the blue tile, not the "oS" text tile', () => {
  // Expanded desktop sidebar: the tile is decorative next to the wordmark.
  const expanded = render(<MemoryRouter><Sidebar /></MemoryRouter>);
  const expandedTile = screen.getByTestId('brand-mark');
  expectBlueTileWithWhiteHouse(expandedTile);
  expect(expandedTile.getAttribute('aria-hidden')).toBe('true');
  expect(screen.getByRole('heading', { level: 1, name: 'onService PH' })).toBeInTheDocument();
  expect(screen.queryByText('oS')).toBeNull();
  expanded.unmount();

  // Collapsed rail: the tile stands alone, so it is named for screen readers.
  const collapsed = render(<MemoryRouter><Sidebar collapsed /></MemoryRouter>);
  const railTile = screen.getByRole('img', { name: 'onService PH' });
  expect(railTile).toBe(screen.getByTestId('brand-mark'));
  expectBlueTileWithWhiteHouse(railTile);
  expect(screen.queryByText('oS')).toBeNull();
  collapsed.unmount();

  // Phone drawer: the same mark inside the navigation dialog.
  render(<MemoryRouter><Sidebar mobileOpen onClose={vi.fn()} /></MemoryRouter>);
  const drawer = screen.getByRole('dialog', { name: 'Admin workspace navigation' });
  expectBlueTileWithWhiteHouse(within(drawer).getByTestId('brand-mark'));
  expect(within(drawer).getByRole('heading', { level: 1, name: 'onService PH' })).toBeInTheDocument();
  expect(within(drawer).queryByText('oS')).toBeNull();
});
