import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }), useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', servicePrice: 200_000 }),
  createChangeOrder: jest.fn(),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: [], isUploading: false, uploadAll: jest.fn().mockResolvedValue([]),
    removeImage: jest.fn(), showPickerOptions: jest.fn(),
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockRejectedValue(new Error('commission unavailable')) },
}));

import ChangeOrderFormScreen from '../app/provider/job/[id]/change-order';

it('Bug UX-596 — an unavailable change-order commission has a direct retry and no unverified net value', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ChangeOrderFormScreen /></QueryClientProvider>);

  await screen.findByText(/Maximum: ₱1,000.00/i);
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });

  expect(await screen.findByText('Commission preview unavailable')).toBeTruthy();
  expect(screen.queryByText('Your net earnings')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});
