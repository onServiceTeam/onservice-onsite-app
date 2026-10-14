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
// D38 Milestone 2: the form no longer uses useImagePicker or the old quote
// limit from config.service (maxQuotesPerBooking, now requestMaxOpenQuotes on
// the server); both mocks were removed. Media goes through
// useJobMediaUploads, which runs for real here with nothing picked.
jest.mock('@/services/booking.service', () => ({
  createJobRequest: (...args: unknown[]) => mockCreateJobRequest(...args),
  getSubcategoryIntakeFields: (...args: unknown[]) => mockGetSubcategoryIntakeFields(...args),
}));

import JobRequestScreen from '../app/customer/booking/job-request';

// D38 human audit (2026-10-13): the form's labels changed ("Describe the job",
// "Send request"); the fail-closed behaviour this test pins is unchanged.
it('Bug UX-620 — configured quote questions fail closed when the catalog request fails', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);

  fireEvent.change(screen.getByLabelText('Describe the job'), {
    target: { value: 'Please build fitted kitchen cabinets with durable moisture-resistant materials.' },
  });

  expect(await screen.findByText('Job questions unavailable')).toBeTruthy();
  expect(screen.getByText(/questions providers need for an accurate quote/i)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(mockGetSubcategoryIntakeFields).toHaveBeenCalledTimes(2));
  expect(mockCreateJobRequest).not.toHaveBeenCalled();
});
