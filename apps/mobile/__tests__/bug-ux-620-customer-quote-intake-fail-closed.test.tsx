import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetSubcategoryIntakeFields = jest.fn().mockRejectedValue(new Error('catalog unavailable'));
const mockCreateJobRequest = jest.fn();
const mockDraft = {
  categoryId: 'category-1', categoryName: 'Renovation', categorySlug: 'renovation',
  subcategoryId: 'subcategory-1', subcategoryName: 'Custom Cabinets',
  serviceDescription: 'Built-to-measure cabinetry.', pricingType: 'quote',
  address: '22 Mango Avenue', barangay: 'Kamputhaw', city: 'Cebu City', province: 'Cebu',
  latitude: 10.3157, longitude: 123.8854,
};

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: (selector: (state: { draft: typeof mockDraft }) => unknown) => selector({ draft: mockDraft }),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: ['file:///job-1.jpg', 'file:///job-2.jpg'],
    uploadAll: jest.fn().mockResolvedValue(['https://cdn.example/job-1.jpg', 'https://cdn.example/job-2.jpg']),
    removeImage: jest.fn(), showPickerOptions: jest.fn(), isUploading: false,
  }),
}));
jest.mock('@/services/booking.service', () => ({
  createJobRequest: (...args: unknown[]) => mockCreateJobRequest(...args),
  getSubcategoryIntakeFields: (...args: unknown[]) => mockGetSubcategoryIntakeFields(...args),
}));
jest.mock('@/services/config.service', () => ({ getConfig: () => ({ maxQuotesPerBooking: 5 }) }));

import JobRequestScreen from '../app/customer/booking/job-request';

it('Bug UX-620 — configured quote questions fail closed when the catalog request fails', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);

  fireEvent.change(screen.getByLabelText('Describe the custom job'), {
    target: { value: 'Please build fitted kitchen cabinets with durable moisture-resistant materials.' },
  });

  expect(await screen.findByText('Job questions unavailable')).toBeTruthy();
  expect(screen.getByText(/questions providers need for an accurate quote/i)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Submit custom job request' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(mockGetSubcategoryIntakeFields).toHaveBeenCalledTimes(2));
  expect(mockCreateJobRequest).not.toHaveBeenCalled();
});
