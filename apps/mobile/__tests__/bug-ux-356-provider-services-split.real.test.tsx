import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyServices: jest.fn().mockResolvedValue([{
    id: 'service-1',
    providerId: 'provider-1',
    subcategoryId: 'subcategory-1',
    subcategoryName: 'Faucet Repair',
    pricingType: 'fixed',
    basePrice: 55000,
    isActive: true,
  }]),
  addService: jest.fn(),
  removeService: jest.fn(),
}));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([{ id: 'category-1', slug: 'cleaning', name: 'Cleaning' }]),
  getSubcategories: jest.fn().mockResolvedValue({
    subcategories: [{ id: 'subcategory-2', name: 'General Cleaning' }],
  }),
}));

import ManageServicesScreen from '../app/provider/services';

it('Bug UX-356 — provider services keeps the profile list beside a directly usable add-service workspace on tablet and desktop', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ManageServicesScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText('Faucet Repair')).toBeTruthy());
  expect(screen.getByLabelText('Tablet and desktop service management workspace')).toBeTruthy();
  expect(screen.getByLabelText('Services on your profile').textContent).toContain('1');
  expect(screen.getByText('Add a Service')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Cleaning' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'General Cleaning' })).toBeTruthy());
});
