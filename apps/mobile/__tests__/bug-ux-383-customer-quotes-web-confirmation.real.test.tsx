import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { acceptQuote } from '@/services/booking.service';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: 'booking-quote' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingQuotes: jest.fn().mockResolvedValue([{
    id: 'quote-1',
    bookingId: 'booking-quote',
    providerId: 'provider-1',
    providerName: 'Cebu Cooling',
    providerRating: 4.8,
    providerTotalJobs: 42,
    quotedPrice: 150000,
    description: 'Complete aircon cleaning with inspection.',
    lineItems: [],
    laborAmount: 150000,
    materialsAmount: 0,
    estimatedDays: 1,
    notes: null,
    status: 'submitted',
    expiresAt: '2099-08-25T00:00:00.000Z',
  }]),
  acceptQuote: jest.fn().mockResolvedValue({ id: 'quote-1', status: 'accepted' }),
  declineQuote: jest.fn(),
}));

import QuotesScreen from '../app/customer/booking/quotes';

it('Bug UX-383 — desktop quote acceptance uses the shared accessible confirmation and continues to the registered payment route', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Accept quote from Cebu Cooling' }));
  const dialog = screen.getByRole('alert');
  expect(dialog.textContent).toContain('Accept this quote?');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Accept Quote' }));

  await waitFor(() => expect(acceptQuote).toHaveBeenCalledWith('booking-quote', 'quote-1'));
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/customer/booking/pay',
    params: { bookingId: 'booking-quote' },
  });
});
