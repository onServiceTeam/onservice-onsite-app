import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetBooking = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'dispute-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getDisputeById: jest.fn().mockResolvedValue({
    id: 'dispute-1', bookingId: 'booking-1', filedBy: 'customer-1', type: 'damage',
    description: 'The cabinet was damaged during service.', status: 'open', tier: 1, assignedTo: null,
    resolutionType: null, refundAmount: 0, refundPercent: null, decisionNotes: null,
    providerResponse: null, providerRespondedAt: null, autoResolved: false, resolvedAt: null,
    resolvedBy: null, createdAt: '2026-08-24T01:00:00.000Z', updatedAt: '2026-08-24T01:00:00.000Z',
    customerName: 'Ana Cruz', providerName: 'Cebu Prime', evidence: [],
  }),
  getBookingById: (...args: unknown[]) => mockGetBooking(...args),
  respondToDispute: jest.fn(),
}));

import DisputeCaseScreen from '../src/components/disputes/DisputeCaseScreen';

it('Bug UX-647 — a failed booking-context lookup is explicit and retryable inside an otherwise available dispute', async () => {
  mockGetBooking.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
    id: 'booking-1', status: 'disputed', totalAmount: 100000, serviceName: 'Cabinet Repair',
    createdAt: '2026-08-23T01:00:00.000Z', customerName: 'Ana Cruz', providerName: 'Cebu Prime',
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><DisputeCaseScreen role="customer" /></QueryClientProvider>);

  expect(await screen.findByText(/booking service and total could not be verified/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry dispute booking context' }));

  await waitFor(() => expect(mockGetBooking).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Cabinet Repair')).toBeTruthy();
  expect(screen.getByText('₱1,000.00')).toBeTruthy();
});
