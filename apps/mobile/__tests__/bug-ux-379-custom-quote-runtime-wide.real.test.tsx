import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDraft = {
  categoryId: 'category-1',
  categoryName: 'Renovation',
  categorySlug: 'renovation',
  subcategoryId: 'subcategory-1',
  subcategoryName: 'Custom Cabinets',
  serviceDescription: 'Build cabinets to the customer measurements.',
  pricingType: 'quote',
  address: '22 Mango Avenue',
  barangay: 'Kamputhaw',
  city: 'Cebu City',
  province: 'Cebu',
  latitude: 10.3157,
  longitude: 123.8854,
};

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: (selector: (state: { draft: typeof mockDraft }) => unknown) => selector({ draft: mockDraft }),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({ localUris: [], uploadAll: jest.fn(), removeImage: jest.fn(), showPickerOptions: jest.fn(), isUploading: false }),
}));
jest.mock('@/services/booking.service', () => ({
  createJobRequest: jest.fn(),
  getSubcategoryIntakeFields: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/config.service', () => ({ getConfig: () => ({ maxQuotesPerBooking: 2 }) }));

import JobRequestScreen from '../app/customer/booking/job-request';

it('Bug UX-379 — desktop custom quote request uses a split workspace and mirrors the admin-controlled quote limit', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Wide custom quote request workspace')).toBeTruthy();
  expect(screen.getByLabelText('Describe the custom job')).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(4);
  expect(screen.getByRole('button', { name: 'Add a custom job photo' })).toBeTruthy();
  expect(screen.getByText(/Up to 2 providers can send quotes/i)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Submit custom job request' }) as HTMLButtonElement).disabled).toBe(true);
});
