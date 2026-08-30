import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMyServices } from '@/services/provider-api.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyServices: jest.fn().mockRejectedValue(new Error('services unavailable')),
  addService: jest.fn(),
  removeService: jest.fn(),
}));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([{ id: 'category-1', slug: 'cleaning', name: 'Cleaning' }]),
  getSubcategories: jest.fn().mockResolvedValue({ subcategories: [] }),
}));

import ManageServicesScreen from '../app/provider/services';

it('Bug UX-583 — a failed provider-services feed is not shown as a confirmed empty profile', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ManageServicesScreen /></QueryClientProvider>);

  expect(await screen.findByText('Services unavailable')).toBeTruthy();
  expect(screen.queryByText('No services added yet')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(getMyServices).toHaveBeenCalledTimes(2));
});
