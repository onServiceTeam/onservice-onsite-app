import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import SearchScreen from '../app/customer/search';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug UX-046 — search routes hourly services to configuration and keeps canonical scope in the booking draft', async () => {
  mockPush.mockClear();
  useBookingStore.getState().reset();
  // Human audit 2026-10-13 (D38): this test covers the old catalog routing,
  // which now runs only when admin turns the request_first_booking setting
  // off. The /api/v1/config response below is that admin switch. The
  // request-first default is covered by HA-07
  // (ha-07-search-request-first-results.real.test.tsx).
  (api.get as jest.Mock).mockReset().mockImplementation(async (url: string) => (url === '/api/v1/config'
    ? { data: { success: true, data: { requestFirstBooking: false } } }
    : {
      data: {
        success: true,
        data: {
          services: [{
            id: 'service-hourly', categoryId: 'category-1', categoryName: 'Electrical', categorySlug: 'electrical',
            name: 'Electrical troubleshooting', slug: 'electrical-troubleshooting',
            description: 'Includes on-site diagnosis and an explanation of the recommended repair before approval.',
            pricingType: 'hourly', basePrice: null, minPrice: null, maxPrice: null,
            estimatedDurationMinutes: 60, unitLabel: null, unitPrice: null, hourlyRate: 70000, displayOrder: 1,
          }],
          providers: [],
        },
      },
    }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><SearchScreen /></QueryClientProvider>);

  fireEvent.change(container.querySelector('input')!, { target: { value: 'electrical' } });
  // The hourly rate label only renders in the catalog flow, so this also
  // waits until the admin switch above has been applied.
  expect(await screen.findByText('Per hour')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Electrical troubleshooting/i }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/customer/booking/configure'));
  expect(useBookingStore.getState().draft).toMatchObject({
    subcategoryName: 'Electrical troubleshooting',
    serviceDescription: 'Includes on-site diagnosis and an explanation of the recommended repair before approval.',
    pricingType: 'hourly',
    isHourly: true,
    hourlyRate: 70000,
  });
});
