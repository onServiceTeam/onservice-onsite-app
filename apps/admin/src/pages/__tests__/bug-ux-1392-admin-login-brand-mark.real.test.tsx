// UX-1392 (Ken, 2026-10-14): the admin sign-in page showed the brand as an
// orange "on" plus "Service", the only place in the product that did. Ken's
// logo is the house, the same mark as the phone app's sign-in panel, with
// "onService PH" in one colour and no orange in the mark. (An earlier fix put
// an "oS" text tile here; Ken overruled the "oS" mark, so it is the house now.)
// Brand rule (docs/design-system/brand/README.md): on the brand blue panel the
// tile is white with a blue house; on the light page below 768px it is a blue
// tile with a white house.
import { it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ isAuthenticated: false, login: vi.fn() }),
}));

import LoginPage from '../LoginPage';

// The two path strings of the lucide 0.456.0 "house" icon, copied from the
// brand rulebook (docs/design-system/brand/README.md, "do not redraw").
const HOUSE_PATHS = [
  'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
  'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
];

function houseIn(tile: HTMLElement): SVGSVGElement {
  const houses = tile.querySelectorAll('svg');
  expect(houses).toHaveLength(1);
  const house = houses[0] as SVGSVGElement;
  expect(house.getAttribute('class')).toContain('lucide-house');
  expect(house.getAttribute('stroke-width')).toBe('2');
  expect(Array.from(house.querySelectorAll('path')).map((path) => path.getAttribute('d'))).toEqual(HOUSE_PATHS);
  return house;
}

it('Bug UX-1392 — the admin sign-in shows the house logo and "onService PH", with no "oS" tile and no orange', () => {
  const { container } = render(<MemoryRouter><LoginPage /></MemoryRouter>);

  // No orange anywhere on the page: no accent token class, no orange hex.
  const accentClasses = Array.from(container.querySelectorAll('[class]'))
    .filter((element) => (element.getAttribute('class') ?? '').includes('color-accent'));
  expect(accentClasses).toHaveLength(0);
  expect(container.innerHTML).not.toMatch(/#fe8a00|#ff8a00/i);
  expect(screen.queryByText('oS')).toBeNull();

  // Brand blue panel: white tile, blue house, white one-colour wordmark.
  const context = screen.getByLabelText('onService operations context');
  const brand = within(context).getByTestId('admin-login-brand');
  const panelTile = within(brand).getByTestId('brand-mark');
  expect(panelTile.textContent).toBe('');
  expect(panelTile.getAttribute('aria-hidden')).toBe('true');
  expect(panelTile.style.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(panelTile.style.width).toBe('48px');
  expect(houseIn(panelTile).getAttribute('stroke')).toBe('#003D9B');
  expect(houseIn(panelTile).getAttribute('width')).toBe('28');
  const panelWordmark = within(brand).getByText('onService PH');
  expect(panelWordmark.children).toHaveLength(0);

  // Light page below 768px: blue tile, white house, one-colour wordmark.
  const compact = screen.getByTestId('admin-login-brand-compact');
  const compactTile = within(compact).getByTestId('brand-mark');
  expect(compactTile.textContent).toBe('');
  expect(compactTile.style.backgroundColor).toBe('rgb(0, 61, 155)');
  expect(houseIn(compactTile).getAttribute('stroke')).toBe('#FFFFFF');
  const compactWordmark = within(compact).getByText('onService PH');
  expect(compactWordmark.children).toHaveLength(0);
});
