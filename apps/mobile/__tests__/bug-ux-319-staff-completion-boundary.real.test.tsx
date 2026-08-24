import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
const mockApiGet = jest.fn();
const mockApiPatch = jest.fn().mockResolvedValue({ data: { success: true } });
const mockGetBookingById = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([
    { id: 'photo-1', storageUrl: 'https://example.test/after-1.jpg' },
    { id: 'photo-2', storageUrl: 'https://example.test/after-2.jpg' },
  ]),
  uploadBookingPhoto: jest.fn(),
  uploadSignature: jest.fn(),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class ApiError extends Error {},
  default: { get: (...args: unknown[]) => mockApiGet(...args), patch: (...args: unknown[]) => mockApiPatch(...args) },
}));
jest.mock('@/utils/image-capture', () => ({ captureImageAsync: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/components/SignaturePad', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => react.createElement('div', { 'data-testid': 'signature-pad' }),
  };
});

import StaffJobCompleteScreen from '../app/staff/job/[id]/complete';

it('Bug UX-319 — staff closeout uses provider-side proof gates without exposing owner earnings or recording customer acceptance from a staff session', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <StaffJobCompleteScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Tablet and desktop team member job completion workspace')).toBeTruthy();
  expect(await screen.findByText('Photos ready')).toBeTruthy();
  expect(screen.queryByText('Customer Signature')).toBeNull();
  expect(screen.queryByText('Earnings preview')).toBeNull();
  expect(screen.getByText('Team-member closeout')).toBeTruthy();
  expect(mockApiGet).not.toHaveBeenCalled();
  expect(mockGetBookingById).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('Submit Completion'));
  await waitFor(() => expect(mockApiPatch).toHaveBeenCalledWith('/api/v1/bookings/booking-1/status', {
    status: 'completed_by_provider',
    completionNotes: undefined,
  }));
  expect(mockReplace).toHaveBeenCalledWith('/staff/jobs');
});
