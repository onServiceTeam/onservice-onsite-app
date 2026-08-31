import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetBookingById = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/booking.service', () => ({ getBookingById: (...args: unknown[]) => mockGetBookingById(...args) }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

import MakeRecurringScreen from '../app/customer/booking/make-recurring';

it('Bug UX-638 — recurring setup without a completed-booking ID shows a usable return path instead of a blank page', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MakeRecurringScreen /></QueryClientProvider>);

  expect(screen.getByText('Recurring setup unavailable')).toBeTruthy();
  expect(screen.getByText(/does not identify a completed booking/i)).toBeTruthy();
  expect(mockGetBookingById).not.toHaveBeenCalled();
});
