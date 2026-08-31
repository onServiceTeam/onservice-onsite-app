import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'air-conditioning' }),
}));
jest.mock('@/services/catalog.service', () => ({
  getSubcategories: jest.fn().mockResolvedValue({
    categoryName: 'Air Conditioning',
    subcategories: [{
      id: 'service-1', categoryId: 'category-1', categoryName: 'Air Conditioning',
      categorySlug: 'air-conditioning', name: 'Aircon cleaning', slug: 'aircon-cleaning',
      description: 'Cleaning with before and after evidence.', pricingType: 'fixed', basePrice: 150000,
      minPrice: 150000, maxPrice: 150000, estimatedDurationMinutes: 90,
      unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
    }],
  }),
}));

import SubcategoryListScreen from '../app/customer/category/[id]';

it('Bug UX-619 — service confirmation closes before routing to the next booking step', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SubcategoryListScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'View Aircon cleaning service details' }));
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Customize service' }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/customer/booking/configure'));
  expect(screen.queryByRole('alert')).toBeNull();
});
