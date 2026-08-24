import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-active' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-active',
    status: 'in_progress',
    serviceName: 'Aircon Deep Clean',
  }),
}));
jest.mock('@/services/review.service', () => ({ createReview: jest.fn() }));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({ localUris: [], uploadAll: jest.fn(), removeImage: jest.fn(), showPickerOptions: jest.fn(), isUploading: false }),
}));

import ReviewScreen from '../app/customer/booking/review';

it('Bug UX-293 — customer review form stays closed until the booking reaches a reviewable completed state', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ReviewScreen /></QueryClientProvider>);

  expect(await screen.findByText(/not ready for a review/i)).toBeTruthy();
  expect(screen.queryByText('Submit Review')).toBeNull();
});
