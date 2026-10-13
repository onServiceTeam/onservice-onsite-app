import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

import JobRequestScreen from '../app/customer/booking/job-request';

// Updated for the D38 human audit (Ken, 2026-10-13). This test used to pin the
// footer "Up to N providers can send quotes" (read from the admin quote limit)
// and a submit button disabled until 50 characters and 2 photos. Ken's notes
// replace that copy with an honest description of what happens and drop the
// 50-character / 2-photo minimum: the button stays pressable and missing
// details are explained inline (HA-REQ-9). The split desktop workspace is
// still asserted.
it('Bug UX-379 — desktop request form uses a split workspace and states plainly what happens to the request', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Wide service request workspace')).toBeTruthy();
  expect(screen.getByLabelText('Describe the job')).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(4);
  expect(screen.getByRole('button', { name: 'Add a job photo' })).toBeTruthy();
  expect(screen.getByText(/Local pros who cover your area will see your request and send a price\. You decide whether to accept\./)).toBeTruthy();
  expect(screen.queryByText(/providers can send quotes/i)).toBeNull();
  await waitFor(() => {
    expect((screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
