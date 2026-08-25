import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'confirmed', serviceName: 'Aircon Cleaning', providerName: 'Cebu Cooling Pro' }),
}));
jest.mock('@/services/review.service', () => ({ createReview: jest.fn() }));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({ localUris: [], uploadAll: jest.fn(), removeImage: jest.fn(), showPickerOptions: jest.fn(), isUploading: false }),
}));

import ReviewScreen from '../app/customer/booking/review';

it('Bug PHASE145-01 — public and private review fields enforce the rendered 1,000-character contract', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ReviewScreen /></QueryClientProvider>);

  expect((await screen.findByPlaceholderText('Share your experience... (min 20 characters)')).getAttribute('maxlength')).toBe('1000');
  expect(screen.getByPlaceholderText('Share confidential feedback with us only — not shown publicly').getAttribute('maxlength')).toBe('1000');
});
