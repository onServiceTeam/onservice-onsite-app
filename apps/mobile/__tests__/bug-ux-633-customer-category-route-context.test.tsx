import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetSubcategories = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/catalog.service', () => ({ getSubcategories: (...args: unknown[]) => mockGetSubcategories(...args) }));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: () => ({ draft: {}, setCategory: jest.fn(), setSubcategory: jest.fn() }),
}));

import SubcategoryListScreen from '../app/customer/category/[id]';

it('Bug UX-633 — a category link without an ID is not presented as a genuinely empty service catalog', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SubcategoryListScreen /></QueryClientProvider>);

  expect(screen.getByText('Category unavailable')).toBeTruthy();
  expect(screen.queryByText('No services yet')).toBeNull();
  expect(mockGetSubcategories).not.toHaveBeenCalled();
});
