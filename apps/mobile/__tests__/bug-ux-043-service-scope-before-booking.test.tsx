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
    categoryName: 'Aircon',
    subcategories: [{
      id: 'service-1', categoryId: 'category-1', name: 'Aircon cleaning', slug: 'aircon-cleaning',
      description: '', pricingType: 'fixed', basePrice: 95000, minPrice: null, maxPrice: null,
      estimatedDurationMinutes: 90, unitLabel: null, unitPrice: null, hourlyRate: null,
      displayOrder: 1,
    }],
  }),
}));

import SubcategoryListScreen from '../app/customer/category/[id]';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug UX-043 — a customer sees an honest service-scope fallback and confirms it before booking', async () => {
  mockPush.mockClear();
  useBookingStore.getState().reset();
  // Human audit 2026-10-13 (D38): this test covers the old catalog flow, which
  // now runs only when admin turns the request_first_booking setting off. The
  // config response below is that admin switch. The request-first default is
  // covered by HA-04 (ha-04-category-request-first-rows.real.test.tsx).
  (api.get as jest.Mock).mockImplementation(async (url: string) => (url === '/api/v1/config'
    ? { data: { success: true, data: { requestFirstBooking: false } } }
    : { data: {} }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SubcategoryListScreen /></QueryClientProvider>);

  expect(await screen.findByText('SCOPE DETAILS PENDING')).toBeTruthy();
  expect(screen.getByText(/Scope details have not been published yet/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'View Aircon cleaning service details' }));
  expect(screen.getByRole('alert').textContent).toMatch(/Confirm what is included with the provider in onService/i);

  fireEvent.click(screen.getByRole('button', { name: 'Customize service' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/customer/booking/configure'));
  expect(useBookingStore.getState().draft).toMatchObject({
    categoryName: 'Aircon',
    categorySlug: 'aircon',
    subcategoryName: 'Aircon cleaning',
    serviceDescription: '',
    pricingType: 'fixed',
  });
});
