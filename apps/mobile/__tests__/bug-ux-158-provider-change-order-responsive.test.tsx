import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', servicePrice: 100000 }),
  createChangeOrder: jest.fn(),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: [], isUploading: false, uploadAll: jest.fn().mockResolvedValue([]),
    removeImage: jest.fn(), showPickerOptions: jest.fn(),
  }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class ApiError extends Error {},
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'pro', commissionRate: 0.11 } } }) },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import ChangeOrderFormScreen from '../app/provider/job/[id]/change-order';

it('BUG-UX-158 — change orders render a bounded tablet and desktop workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ChangeOrderFormScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop provider change order workspace')).toBeTruthy();
  expect(screen.getByText('Request Change Order')).toBeTruthy();
});
