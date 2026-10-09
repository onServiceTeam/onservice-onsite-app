import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'dispute-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getDisputeById: jest.fn().mockResolvedValue({
    id: 'dispute-1', bookingId: 'booking-1', filedBy: 'customer-1', type: 'incomplete',
    description: 'Part of the booked service was not completed.', status: 'resolved',
    tier: 2, assignedTo: 'admin-1', resolutionType: 'partial_refund', refundAmount: 25000,
    refundPercent: 25, decisionNotes: 'One quarter of the booking was not delivered.',
    providerResponse: 'The provider confirms the missing task.',
    providerRespondedAt: '2026-09-01T02:00:00.000Z', autoResolved: false,
    resolvedAt: '2026-09-01T03:00:00.000Z', resolvedBy: 'admin-1',
    createdAt: '2026-09-01T01:00:00.000Z', updatedAt: '2026-09-01T03:00:00.000Z',
    customerName: 'Ana Cruz', providerName: 'Cebu Prime', evidence: [],
  }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', status: 'resolved', totalAmount: 100000, serviceName: 'Home Cleaning',
    createdAt: '2026-08-31T01:00:00.000Z', customerName: 'Ana Cruz', providerName: 'Cebu Prime',
  }),
  respondToDispute: jest.fn(),
}));

import DisputeCaseScreen from '../src/components/disputes/DisputeCaseScreen';

it('Bug OPS-315 — a resolved dispute labels the amount as approved and does not imply payment completion', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DisputeCaseScreen role="customer" />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Approved refund: ₱250.00')).toBeTruthy();
  expect(screen.getByText(/case decision amount/)).toBeTruthy();
  expect(screen.getByText(/processing and completion status/)).toBeTruthy();
  expect(screen.queryByText('Refund: ₱250.00')).toBeNull();
});
