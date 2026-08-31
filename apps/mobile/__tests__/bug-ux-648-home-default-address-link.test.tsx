import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([{ id: 'category-1', name: 'Cleaning', slug: 'cleaning' }]),
  getActivePromotions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockResolvedValue([]), getRecentBookings: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([{
  id: 'address-1', label: 'Home', fullAddress: '12 Mango Street', barangay: 'Banilad', city: 'Mandaue City',
  province: 'Cebu', isDefault: true, latitude: 10.3, longitude: 123.9,
}]) }));
jest.mock('@/services/api', () => ({
  __esModule: true, default: { get: jest.fn().mockResolvedValue({ data: { data: [], meta: { unread: 0 } } }) },
}));

import HomeScreen from '../app/(tabs)/home';

it('Bug UX-648 — the home address control truthfully manages the saved default instead of pretending to set the booking location', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);

  const address = await screen.findByRole('button', { name: /default address: home in mandaue city/i });
  expect(screen.getByText('Default Address')).toBeTruthy();
  fireEvent.click(address);
  expect(mockPush).toHaveBeenCalledWith('/customer/addresses');
});
