import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ servicePrice: 100000 }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([]),
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
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
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

it('BUG-UX-154 — completion renders a tablet and desktop evidence workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <JobCompleteScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Tablet and desktop provider job completion workspace')).toBeTruthy();
  expect(screen.getByText('COMPLETION READINESS')).toBeTruthy();
});
