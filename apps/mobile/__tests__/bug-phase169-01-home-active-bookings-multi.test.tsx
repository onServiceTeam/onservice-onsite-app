import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([]),
  getActivePromotions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockImplementation(async () => Array.from({ length: 4 }, (_, index) => ({
    id: `booking-${index + 1}`,
    status: index === 0 ? 'provider_en_route' : 'matched',
    serviceName: `Service ${index + 1}`,
    providerName: `Provider ${index + 1}`,
    scheduledAt: `2026-08-${26 + index}T01:00:00.000Z`,
    totalAmount: 100000,
  }))),
  getRecentBookings: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: [], meta: { unread: 0 } } }) },
}));

import HomeScreen from '../app/(tabs)/home';

it('Bug PHASE169-01 — customer home renders the first three active bookings and links to the complete booking list when more exist', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);

  expect(await screen.findByText('Active Bookings')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Track Service 1 booking' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Track Service 2 booking' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Track Service 3 booking' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Track Service 4 booking' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'See all active bookings' }));
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/bookings');
});
