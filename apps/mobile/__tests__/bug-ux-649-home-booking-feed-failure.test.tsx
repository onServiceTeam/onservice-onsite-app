import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([{ id: 'category-1', name: 'Cleaning', slug: 'cleaning' }]),
  getActivePromotions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockRejectedValue(new Error('offline')),
  getRecentBookings: jest.fn().mockRejectedValue(new Error('offline')),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true, default: { get: jest.fn().mockResolvedValue({ data: { data: [], meta: { unread: 0 } } }) },
}));

import HomeScreen from '../app/(tabs)/home';

it('Bug UX-649 — failed booking feeds do not falsely tell an existing customer to book their first service', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);

  expect(await screen.findByText('Failed to load active bookings.')).toBeTruthy();
  expect(screen.getByText('Failed to load recent bookings.')).toBeTruthy();
  expect(screen.queryByText('Book your first service!')).toBeNull();
});
