import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetDisputeById = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn(),
  getDisputeById: (...args: unknown[]) => mockGetDisputeById(...args),
  respondToDispute: jest.fn(),
}));

import CustomerDisputeCaseScreen from '../app/customer/dispute/[id]';

it('Bug UX-630 — a dispute link without a case ID fails explicitly instead of showing an endless loader', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerDisputeCaseScreen /></QueryClientProvider>);

  expect(screen.getByText('Dispute unavailable')).toBeTruthy();
  expect(screen.getByText(/does not identify a dispute case/i)).toBeTruthy();
  expect(mockGetDisputeById).not.toHaveBeenCalled();
});
