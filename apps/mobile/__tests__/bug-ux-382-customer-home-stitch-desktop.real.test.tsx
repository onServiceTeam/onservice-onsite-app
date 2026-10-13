import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
  byBreakpoint: (_breakpoint: string, values: { desktop: number }) => values.desktop,
}));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([{ id: 'category-1', name: 'Cleaning', slug: 'cleaning' }]),
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

// Human audit 2026-10-13 (HA-DISC) changed the copy this test pins: the page
// now has a "Book a service" title (the greeting stays as a small line), the
// search asks for the problem, and a factual "How it works" row replaces the
// TrustStrip and the old "How onService works" tiles. The workspace, category
// and guidance checks below assert the new screen.
it('Bug UX-382 — desktop customer home is a bounded Stitch-style workspace with page title, search, category, and how-it-works guidance', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Wide customer home workspace')).toBeTruthy();
  expect(screen.getByText('Book a service')).toBeTruthy();
  expect(screen.getByText('Welcome back, Ana')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Describe the problem to find a service' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Browse Cleaning services' })).toBeTruthy();
  expect(screen.getByText('How it works')).toBeTruthy();
  expect(screen.getByText('Get a price from a local pro')).toBeTruthy();
  expect(screen.queryByLabelText('Vetted pros, verified payments use escrow, in-app case tracking')).toBeNull();
});
