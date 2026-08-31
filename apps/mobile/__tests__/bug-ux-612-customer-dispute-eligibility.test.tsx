import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockRejectedValue(new Error('booking unavailable')),
  fileDispute: jest.fn(),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: [], uploadAll: jest.fn().mockResolvedValue([]), removeImage: jest.fn(),
    showPickerOptions: jest.fn(), isUploading: false,
  }),
}));

import DisputeScreen from '../app/customer/booking/dispute';

it('Bug UX-612 — dispute evidence controls stay unavailable until booking eligibility is verified', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><DisputeScreen /></QueryClientProvider>);

  expect(await screen.findByText(/couldn't verify this booking or its dispute eligibility/i)).toBeTruthy();
  expect(screen.queryByText('Submit Dispute')).toBeNull();
  expect(screen.queryByText('What happened?')).toBeNull();
});
