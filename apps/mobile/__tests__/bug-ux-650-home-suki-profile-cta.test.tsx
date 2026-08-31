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
  getActiveBookings: jest.fn().mockResolvedValue([]), getRecentBookings: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn((path: string) => Promise.resolve(path.includes('/suki/')
    ? { data: { data: [{ id: 'membership-1', providerId: 'provider-1', providerName: 'Cebu Prime', tier: 'suki', totalBookings: 4, discount: 5 }] } }
    : { data: { data: [], meta: { unread: 0 } } })) },
}));

import HomeScreen from '../app/(tabs)/home';

it('Bug UX-650 — a Suki card says View services because it opens a profile and does not assign or book that provider', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);

  expect(await screen.findByText('View services')).toBeTruthy();
  expect(screen.queryByText('Book')).toBeNull();
});
