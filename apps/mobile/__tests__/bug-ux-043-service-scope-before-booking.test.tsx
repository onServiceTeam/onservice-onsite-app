import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
