// HA-REQ-7 (customer human audit 2026-10-13, D38): the request screen has a
// clear title, "Book a service", with the chosen service as its subtitle, and
// shows the onService price guide only when the service has a catalog range.
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDraft = {
  categoryId: 'category-1', categoryName: 'Aircon Services', categorySlug: 'aircon',
  subcategoryId: 'subcategory-1', subcategoryName: 'Aircon repair',
  serviceDescription: '', pricingType: 'fixed',
  address: '22 Mango Avenue', barangay: 'Kamputhaw', city: 'Cebu City', province: 'Cebu',
  latitude: 10.3157, longitude: 123.8854,
};
const mockApiGet = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: (selector: (state: { draft: typeof mockDraft }) => unknown) => selector({ draft: mockDraft }),
}));
// D38 Milestone 2: the form no longer uses useImagePicker; that mock was removed.
jest.mock('@/services/booking.service', () => ({
  createJobRequest: jest.fn(),
  getSubcategoryIntakeFields: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

import JobRequestScreen from '../app/customer/booking/job-request';

function renderScreen(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);
  return client;
}

beforeEach(() => mockApiGet.mockReset());

it('HA-REQ-7: the request screen is titled "Book a service" and names the chosen service', () => {
  mockApiGet.mockResolvedValue({ data: { success: true, data: { minCents: null, maxCents: null } } });
  renderScreen();

  const title = screen.getByText('Book a service');
  expect(title.getAttribute('role')).toBe('header');
  expect(screen.getByText('Aircon repair')).toBeTruthy();
  expect(screen.queryByText('Request Custom Quote')).toBeNull();
});

it('HA-REQ-7: the budget section shows the onService price guide when the service has a catalog range', async () => {
  mockApiGet.mockResolvedValue({ data: { success: true, data: { minCents: 50000, maxCents: 150000 } } });
  renderScreen();

  expect(await screen.findByText('onService price guide for this service: ₱500.00 to ₱1,500.00')).toBeTruthy();
  expect(mockApiGet).toHaveBeenCalledWith('/api/v1/catalog/subcategories/subcategory-1/bounds');
});

it('HA-REQ-7: no price guide is shown when the service has no catalog range', async () => {
  mockApiGet.mockResolvedValue({ data: { success: true, data: { minCents: null, maxCents: null } } });
  const client = renderScreen();

  // Wait until the catalog range has loaded and the screen has re-rendered.
  await waitFor(() => {
    expect(client.getQueryState(['subcategory-price-bounds', 'subcategory-1'])?.status).toBe('success');
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  expect(screen.getByText('Your budget')).toBeTruthy();
  expect(screen.queryByText(/onService price guide/)).toBeNull();
});
