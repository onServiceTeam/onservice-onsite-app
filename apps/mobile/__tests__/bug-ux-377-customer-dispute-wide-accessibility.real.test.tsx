import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: [],
    uploadAll: jest.fn().mockResolvedValue([]),
    removeImage: jest.fn(),
    showPickerOptions: jest.fn(),
    isUploading: false,
  }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    status: 'completed_by_provider',
    completedAt: new Date().toISOString(),
  }),
  fileDispute: jest.fn(),
}));

import DisputeScreen from '../app/customer/booking/dispute';

it('Bug UX-377 — tablet dispute filing separates reason selection from evidence and exposes every decision control accessibly', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><DisputeScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Wide dispute review form')).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(7);
  expect(screen.getByLabelText('Dispute description')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add dispute evidence photo' })).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Submit dispute' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/support sees the same evidence/i)).toBeTruthy();
});
