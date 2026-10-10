import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-phase194' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-phase194', servicePrice: 100_000 }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([]),
  uploadBookingPhoto: jest.fn(),
  uploadSignature: jest.fn(),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'verified', commissionRate: 0.15 } } }), patch: jest.fn() },
}));
jest.mock('@/utils/image-capture', () => ({ captureImageAsync: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/components/SignaturePad', () => ({ __esModule: true, default: () => null }));

import JobCompleteScreen from '../app/provider/job/[id]/complete';

it('Bug PHASE194-01 - provider completion notes enforce the server limit and show the counter', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <JobCompleteScreen />
    </QueryClientProvider>,
  );

  await screen.findByText('Notes (optional)');
  const notes = screen.getByPlaceholderText(/Anything the customer should know/);
  expect(notes.getAttribute('maxlength')).toBe('2000');
  fireEvent.change(notes, { target: { value: 'Customer should know the unit was tested after cleaning.' } });
  await waitFor(() => expect(screen.getByText(/\/2000$/)).toBeTruthy());
});
