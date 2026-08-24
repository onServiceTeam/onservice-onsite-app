import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateChangeOrder = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', servicePrice: 100_000 }),
  createChangeOrder: (...args: unknown[]) => mockCreateChangeOrder(...args),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: [], isUploading: false, uploadAll: jest.fn().mockResolvedValue([]),
    removeImage: jest.fn(), showPickerOptions: jest.fn(),
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'pro', commissionRate: 0.11 } } }) },
}));

import ChangeOrderFormScreen from '../app/provider/job/[id]/change-order';

it('Bug PHASE91-01 — change-order form shows the real 50% cap and blocks an over-cap submission', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ChangeOrderFormScreen /></QueryClientProvider>);

  expect(await screen.findByText(/maximum: ₱500.00.*50% of original ₱1,000.00/i)).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText(/describe the additional work/i), {
    target: { value: 'Replace additional damaged pipe sections.' },
  });
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '600' } });

  expect(screen.getByText(/exceeds maximum of ₱500.00/i)).toBeTruthy();
  const submit = screen.getByText('Submit Change Order').closest('button') as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.click(submit);
  expect(mockCreateChangeOrder).not.toHaveBeenCalled();
  expect(screen.queryByText(/may require admin approval/i)).toBeNull();
});
