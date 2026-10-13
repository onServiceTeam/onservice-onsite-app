// Human audit 2026-10-13, item HA-05 (D38): the fixed-price catalog flow
// stays in the code behind the admin setting request_first_booking. When the
// server sends requestFirstBooking: false, the category screen shows the old
// prices and opens the old detail dialog and configure flow.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'aircon' }),
}));
jest.mock('@/services/catalog.service', () => ({
  getSubcategories: jest.fn().mockResolvedValue({
    categoryName: 'Aircon Services',
    subcategories: [{
      id: 'svc-fixed', categoryId: 'cat-aircon', name: 'Aircon cleaning', slug: 'aircon-cleaning',
      description: 'Indoor and outdoor unit cleaning with before and after photos.', pricingType: 'fixed',
      basePrice: 95000, minPrice: null, maxPrice: null, estimatedDurationMinutes: 90,
      unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
    }],
  }),
}));

import SubcategoryListScreen from '../app/customer/category/[id]';
import { useBookingStore } from '../src/stores/booking.store';

it('HA-05: with requestFirstBooking false, category rows show the old price and open the old detail and configure flow', async () => {
  mockPush.mockClear();
  useBookingStore.getState().reset();
  (api.get as jest.Mock).mockReset().mockImplementation(async (url: string) => (url === '/api/v1/config'
    ? { data: { success: true, data: { requestFirstBooking: false } } }
    : { data: {} }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SubcategoryListScreen /></QueryClientProvider>);

  expect(await screen.findByText('Starting at')).toBeTruthy();
  expect(screen.getByText('₱950.00')).toBeTruthy();
  expect(screen.queryByText('How pricing works')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'View Aircon cleaning service details' }));
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Customize service' }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/customer/booking/configure'));
  expect(useBookingStore.getState().draft).toMatchObject({
    subcategoryName: 'Aircon cleaning',
    pricingType: 'fixed',
    basePrice: 95000,
  });
});
