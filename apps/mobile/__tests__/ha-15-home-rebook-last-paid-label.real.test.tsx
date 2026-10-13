// Human audit 2026-10-13, item HA-15 (task HA-DISC item 6, review fix): Quick
// Re-book showed a bare peso amount right above "Book Again", which reads as
// the price of booking again. With request-first booking a pro prices the new
// job, so the amount could differ. The card now labels the amount as what the
// customer paid last time (a past fact, not a set price).
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([{ id: 'cat-aircon', name: 'Aircon Services', slug: 'aircon' }]),
  getActivePromotions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockResolvedValue([]),
  getRecentBookings: jest.fn().mockResolvedValue([
    {
      id: 'booking-1',
      status: 'confirmed',
      categoryId: 'cat-aircon',
      serviceName: 'Aircon cleaning',
      providerName: 'Cebu Cool Air',
      totalAmount: 150000,
      scheduledAt: '2026-09-01T02:00:00.000Z',
    },
  ]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: [], meta: { unread: 0 } } }) },
}));

import HomeScreen from '../app/(tabs)/home';

it('HA-15: Quick Re-book labels the amount as what the customer paid last time, not as a price to book again', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);

  const card = await screen.findByRole('button', { name: 'Book Aircon cleaning again' });
  const text = card.textContent ?? '';
  expect(text).toContain('You paid last time');
  expect(text).toContain('₱1,500.00');
  // The label comes before the amount, so the amount reads as history.
  expect(text.indexOf('You paid last time')).toBeLessThan(text.indexOf('₱1,500.00'));
});
