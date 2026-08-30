import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockRejectedValue(new Error('job unavailable')),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([]),
  uploadBookingPhoto: jest.fn(),
  uploadSignature: jest.fn(),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: { tier: 'verified', commissionRate: 0.13 } } }),
    patch: jest.fn(),
  },
}));
jest.mock('@/utils/image-capture', () => ({ captureImageAsync: jest.fn() }));
jest.mock('@/components/SignaturePad', () => ({ __esModule: true, default: () => null }));

import JobCompleteScreen from '../app/provider/job/[id]/complete';

it('Bug UX-588 — provider completion controls stay unavailable until the job record is verified', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobCompleteScreen /></QueryClientProvider>);

  expect(await screen.findByText('Job unavailable')).toBeTruthy();
  expect(screen.queryByText('Submit Completion')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(getBookingById).toHaveBeenCalledTimes(2));
});
