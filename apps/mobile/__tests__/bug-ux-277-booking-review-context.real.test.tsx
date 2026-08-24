import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'confirmed', serviceName: 'Aircon Deep Clean', providerName: 'Cebu Cooling Pro' }),
}));
jest.mock('@/services/review.service', () => ({ createReview: jest.fn() }));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({ localUris: [], uploadAll: jest.fn(), removeImage: jest.fn(), showPickerOptions: jest.fn(), isUploading: false }),
}));

import ReviewScreen from '../app/customer/booking/review';

it('Bug UX-277 — customer review identifies the completed service/provider and renders a bounded wide feedback workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ReviewScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop customer booking review workspace')).toBeTruthy();
  expect(screen.getByText('Aircon Deep Clean')).toBeTruthy();
  expect(screen.getByText('Provided by Cebu Cooling Pro')).toBeTruthy();
  expect(screen.getByText(/only visible to our support team/i)).toBeTruthy();
});
