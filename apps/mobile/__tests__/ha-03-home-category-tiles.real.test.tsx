// Human audit 2026-10-13, item HA-03 (Ken's notes): the category grid looked
// "cartoonish", "like a game", with "fake / unrealistic icons" that "don't
// [show] what the service is for". Every tile now has one calm style (white,
// solid 1px border, radius 12, brand-blue icon) and an icon that depicts the
// job. (Hiding empty categories is HA-08; the neutral tint helper is HA-09.)
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { colors } from '@/config/theme';

// Flatten RN style arrays on the pressable host so each tile's real style
// lands on the DOM element and can be compared (same pattern as UX-1337).
// The shared stub sets StyleSheet.hairlineWidth to 1, which would make a
// hairline border indistinguishable from the required solid 1px border, so
// this file uses a device-like 0.5 instead.
jest.mock('react-native', () => {
  const native = jest.requireActual('../__mocks__/react-native.js');
  const runtime = jest.requireActual('react');
  const FlatPressable = ({ style, ...props }: { style?: unknown }) =>
    runtime.createElement(native.Pressable, { ...props, style: native.StyleSheet.flatten(style) });
  return {
    ...native,
    StyleSheet: { ...native.StyleSheet, hairlineWidth: 0.5 },
    Pressable: FlatPressable,
    TouchableOpacity: FlatPressable,
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([
    { id: 'cat-cleaning', name: 'Cleaning', slug: 'cleaning' },
    { id: 'cat-aircon', name: 'Aircon Services', slug: 'aircon' },
    { id: 'cat-electrical', name: 'Electrical', slug: 'electrical' },
    { id: 'cat-pest', name: 'Pest Control', slug: 'pest-control' },
    { id: 'cat-roofing', name: 'Roofing', slug: 'roofing' },
    { id: 'cat-landscaping', name: 'Landscaping', slug: 'landscaping' },
  ]),
  getActivePromotions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockResolvedValue([]),
  getRecentBookings: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));

import HomeScreen from '../app/(tabs)/home';

// Service counts from the public GET /api/v1/catalog/full. "fullCatalog"
// lists every category with its active services.
function mockApi(fullCatalog: Array<{ id: string; subcategories: unknown[] }>): void {
  (api.get as jest.Mock).mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/v1/catalog/full') return { data: { success: true, data: fullCatalog } };
    return { data: { success: true, data: [], meta: { unread: 0 } } };
  });
}

async function renderHome(): Promise<HTMLElement[]> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);
  await screen.findByText('Choose a service');
  return screen.queryAllByTestId(/^category-tile-/);
}

// jsdom normalises colours differently per property, so normalise the
// expected value through the same property.
function cssValue(property: 'backgroundColor' | 'borderColor', value: string): string {
  const probe = document.createElement('div');
  probe.style[property] = value;
  return probe.style[property];
}

it('HA-03: every category tile uses the same neutral bordered style with no per-category colour', async () => {
  mockApi([]);
  const tiles = await renderHome();

  expect(tiles).toHaveLength(6);
  const firstStyle = tiles[0]!.getAttribute('style');
  for (const tile of tiles) {
    expect(tile.getAttribute('style')).toBe(firstStyle);
    expect(tile.style.backgroundColor).toBe(cssValue('backgroundColor', colors.surface));
    expect(tile.style.borderWidth).toBe('1px');
    expect(tile.style.borderColor).toBe(cssValue('borderColor', colors.border));
    expect(tile.style.borderRadius).toBe('12px');
    const icon = tile.querySelector('[data-icon]');
    expect(icon?.getAttribute('size')).toBe('28');
    expect(icon?.getAttribute('color')).toBe(colors.primary);
  }
});

it('HA-03: the aircon tile draws the AirVent icon', async () => {
  mockApi([]);
  await renderHome();

  const aircon = screen.getByTestId('category-tile-aircon');
  expect(aircon.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('AirVent');
});

it('HA-03: roofing and landscaping tiles show their own icons instead of a hammer', async () => {
  mockApi([]);
  await renderHome();

  expect(screen.getByTestId('category-tile-roofing').querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('House');
  expect(screen.getByTestId('category-tile-landscaping').querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('Trees');
});
