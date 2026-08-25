import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking } from 'react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
  byBreakpoint: (_breakpoint: string, values: { desktop: number }) => values.desktop,
}));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([]),
  getActivePromotions: jest.fn().mockResolvedValue([
    { id: 'promo-internal', title: 'Cleaning week', ctaText: 'Browse', ctaLink: '/customer/category/cleaning' },
    { id: 'promo-external', title: 'Partner offer', ctaText: 'Learn more', ctaLink: 'https://onservice.ph/promo' },
  ]),
}));
jest.mock('@/services/booking.service', () => ({ getActiveBookings: jest.fn().mockResolvedValue([]), getRecentBookings: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn().mockResolvedValue({ data: { data: [], meta: { unread: 0 } } }) } }));

import HomeScreen from '../app/(tabs)/home';

it('Bug PHASE88-01 — rendered promotion actions route internal destinations and open HTTP links externally', async () => {
  const externalSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Browse: Cleaning week' }));
  expect(mockPush).toHaveBeenCalledWith('/customer/category/cleaning');
  fireEvent.click(screen.getByRole('button', { name: 'Learn more: Partner offer' }));
  expect(externalSpy).toHaveBeenCalledWith('https://onservice.ph/promo');
  externalSpy.mockRestore();
});
