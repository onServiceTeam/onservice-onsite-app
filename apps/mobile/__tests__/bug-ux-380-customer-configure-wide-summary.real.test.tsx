import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockStoreState = {
  draft: {
    categoryId: 'category-1',
    categoryName: 'Cleaning',
    categorySlug: 'cleaning',
    subcategoryId: 'subcategory-1',
    subcategoryName: 'Home Cleaning',
    serviceDescription: 'Standard home cleaning scope.',
    pricingType: 'fixed',
    basePrice: 100000,
    addons: [],
    isHourly: false,
    hourlyRate: 0,
    estimatedHours: 1,
  },
  setAddons: jest.fn(),
  setEstimatedHours: jest.fn(),
};

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: (selector?: (value: typeof mockStoreState) => unknown) => selector ? selector(mockStoreState) : mockStoreState,
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({
      data: { data: [{ id: 'addon-1', subcategoryId: 'subcategory-1', name: 'Inside refrigerator', description: 'Clean shelves and drawers.', price: 20000, displayOrder: 1 }] },
    }),
  },
}));

import ConfigureScreen from '../app/customer/booking/configure';

it('Bug UX-380 — tablet service configuration keeps add-ons and an always-visible price summary in one workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ConfigureScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Wide service customization workspace')).toBeTruthy();
  expect(screen.getByLabelText('Service price summary')).toBeTruthy();
  expect(screen.getByText('Estimated Total')).toBeTruthy();

  const addon = await screen.findByRole('checkbox', { name: /Inside refrigerator/i });
  expect(addon.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(addon);
  expect(screen.getAllByText('Inside refrigerator')).toHaveLength(2);
  expect(screen.getByText(/final checkout shows the service, add-ons, fee, schedule, and payment method/i)).toBeTruthy();
});
