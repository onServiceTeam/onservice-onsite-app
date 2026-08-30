import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getCategories, getSubcategories } from '@/services/catalog.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyServices: jest.fn().mockResolvedValue([]),
  addService: jest.fn(),
  removeService: jest.fn(),
}));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn()
    .mockRejectedValueOnce(new Error('categories unavailable'))
    .mockResolvedValue([{ id: 'category-1', slug: 'cleaning', name: 'Cleaning' }]),
  getSubcategories: jest.fn().mockRejectedValue(new Error('options unavailable')),
}));

import ManageServicesScreen from '../app/provider/services';

it('Bug UX-584 — each failed level of the add-service catalog has its own direct retry path', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ManageServicesScreen /></QueryClientProvider>);

  expect(await screen.findByText('Service categories unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cleaning' })).toBeTruthy());
  expect(getCategories).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole('button', { name: 'Cleaning' }));
  expect(await screen.findByText('Service options unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(getSubcategories).toHaveBeenCalledTimes(2));
});
