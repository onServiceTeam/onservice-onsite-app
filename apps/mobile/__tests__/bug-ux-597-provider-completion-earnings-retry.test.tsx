import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }), useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', servicePrice: 100_000 }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([]), uploadBookingPhoto: jest.fn(), uploadSignature: jest.fn(),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockRejectedValue(new Error('commission unavailable')), patch: jest.fn() },
}));
jest.mock('@/utils/image-capture', () => ({ captureImageAsync: jest.fn() }));
jest.mock('@/components/SignaturePad', () => ({ __esModule: true, default: () => null }));

import JobCompleteScreen from '../app/provider/job/[id]/complete';

it('Bug UX-597 — completion exposes a retryable earnings-preview failure instead of silently omitting money context', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobCompleteScreen /></QueryClientProvider>);

  expect(await screen.findByText('Earnings preview unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});
