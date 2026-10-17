// Bug UX-1422: on a phone, the customer home header (the first screen every
// signed-in customer sees in the app) showed only the text "onService", with
// no logo. Ken (2026-10-14): the logo is the house, the same everywhere. On
// the light header bar the logo is a brand-blue tile with a white house,
// next to the one-colour wordmark in brand blue. The logo colours are the
// fixed brand values, so the expected colours are written out here.
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([{ id: 'category-1', name: 'Aircon Services', slug: 'aircon' }]),
  getActivePromotions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockResolvedValue([]),
  getRecentBookings: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: [], meta: { unread: 0 } } }) },
}));

import HomeScreen from '../app/(tabs)/home';

function cssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.color = value;
  return probe.style.color;
}

it('Bug UX-1422 — the phone home header shows the blue house tile beside the "onService" wordmark', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);
  await screen.findByText('Book a service');

  const brand = screen.getByTestId('home-brand');
  const tile = within(brand).getByTestId('home-brand-mark');
  expect(tile.style.backgroundColor).toBe(cssColor('#003D9B'));
  // At least the README's 24 px minimum for a tile on screen.
  expect(Number.parseFloat(tile.style.width)).toBeGreaterThanOrEqual(24);
  const house = tile.querySelector('[data-icon="Home"]');
  expect(house).not.toBeNull();
  expect(house!.getAttribute('color')).toBe('#FFFFFF');
  const wordmark = within(brand).getByTestId('home-wordmark');
  expect(wordmark.textContent).toBe('onService');
  expect(wordmark.style.color).toBe(cssColor('#003D9B'));
  expect(screen.queryByText('oS')).toBeNull();
});
