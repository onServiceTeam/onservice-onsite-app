import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 920, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingQuotes: jest.fn().mockResolvedValue([
    { id: 'quote-1', bookingId: 'booking-1', providerId: 'provider-1', quotedPrice: 120000, description: 'Standard clean', estimatedDurationMinutes: 90, status: 'submitted', laborAmount: 100000, materialsAmount: 20000, estimatedDays: 1, notes: '', portfolioPhotos: [], expiresAt: '2099-08-24T00:00:00.000Z', createdAt: '2026-08-23T00:00:00.000Z', providerName: 'Cebu Prime', providerRating: 4.8, providerTotalJobs: 42, lineItems: [] },
    { id: 'quote-2', bookingId: 'booking-1', providerId: 'provider-2', quotedPrice: 135000, description: 'Deep clean', estimatedDurationMinutes: 120, status: 'submitted', laborAmount: 110000, materialsAmount: 25000, estimatedDays: 1, notes: '', portfolioPhotos: [], expiresAt: '2099-08-24T00:00:00.000Z', createdAt: '2026-08-23T00:00:00.000Z', providerName: 'Mandaue Air Care', providerRating: 4.7, providerTotalJobs: 31, lineItems: [] },
  ]),
  acceptQuote: jest.fn(),
  declineQuote: jest.fn(),
}));

import QuotesScreen from '../app/customer/booking/quotes';

it('Bug UX-020 — quote comparison becomes a two-column grid on tablet and desktop widths', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  const grid = await screen.findByLabelText('Quote comparison grid');
  expect(screen.queryByLabelText('Quote list')).toBeNull();
  expect(grid.children).toHaveLength(2);
  expect(screen.getByText('Cebu Prime')).toBeTruthy();
  expect(screen.getByText('Mandaue Air Care')).toBeTruthy();
});
