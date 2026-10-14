// HA-M2-199 (D38 Milestone 2, package P5b): after "Send request", the
// customer lands on the request status screen for the new request ("We sent
// your request to N local pros"), replacing the form so Back does not
// return to a sent form.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDraft = {
  categoryId: 'category-1', categoryName: 'Aircon Services', categorySlug: 'aircon',
  subcategoryId: 'subcategory-1', subcategoryName: 'Aircon repair',
  serviceDescription: '', pricingType: 'fixed',
  address: '22 Mango Avenue', barangay: 'Kamputhaw', city: 'Cebu City', province: 'Cebu',
  latitude: 10.3157, longitude: 123.8854,
};
const mockCreateJobRequest = jest.fn().mockResolvedValue({ id: 'booking-new-1' });
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args) }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: (selector: (state: { draft: typeof mockDraft }) => unknown) => selector({ draft: mockDraft }),
}));
jest.mock('@/services/booking.service', () => ({
  createJobRequest: (...args: unknown[]) => mockCreateJobRequest(...args),
  getSubcategoryIntakeFields: jest.fn().mockResolvedValue([]),
}));

import JobRequestScreen from '../app/customer/booking/job-request';

it('HA-M2-199: a sent request replaces the form with the request status screen for that request', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);

  fireEvent.change(screen.getByLabelText('Describe the job'), {
    target: { value: 'Bedroom aircon is not cooling at all.' },
  });
  const send = screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement;
  await waitFor(() => expect(send.disabled).toBe(false));
  fireEvent.click(send);

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/customer/booking/request-status',
    params: { bookingId: 'booking-new-1' },
  }));
  expect(mockReplace).toHaveBeenCalledTimes(1);
});
