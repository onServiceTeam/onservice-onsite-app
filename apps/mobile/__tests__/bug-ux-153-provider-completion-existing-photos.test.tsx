import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ servicePrice: 100000 }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([
    { id: 'photo-1', photoType: 'after', storageUrl: 'https://api.onservice.ph/uploads/1.jpg' },
    { id: 'photo-2', photoType: 'after', storageUrl: 'https://api.onservice.ph/uploads/2.jpg' },
  ]),
  uploadBookingPhoto: jest.fn(),
  uploadSignature: jest.fn(),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class ApiError extends Error {},
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: { tier: 'new', commissionRate: 0.15 } } }),
    patch: jest.fn(),
  },
}));
jest.mock('@/utils/image-capture', () => ({ captureImageAsync: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/components/SignaturePad', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: react.forwardRef(function MockSignaturePad() {
      return react.createElement('div', { 'data-testid': 'signature-pad' });
    }),
  };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));

import JobCompleteScreen from '../app/provider/job/[id]/complete';

it('BUG-UX-153 — completion counts canonical after-photos already on file', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <JobCompleteScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/2 on file \+ 0 new \(2\/2 required\)/)).toBeTruthy();
  expect(screen.getByText('Photos ready')).toBeTruthy();
});
