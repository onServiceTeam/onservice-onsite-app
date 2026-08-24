import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'dispute-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getDisputeById: jest.fn().mockResolvedValue({
    id: 'dispute-1', bookingId: 'booking-1', filedBy: 'customer-1', type: 'damage',
    description: 'The cabinet door was damaged during the booked repair.', status: 'under_review',
    tier: 2, assignedTo: null, resolutionType: null, refundAmount: 0, refundPercent: null,
    decisionNotes: null, providerResponse: 'I have supplied my response for staff review.',
    providerRespondedAt: '2026-08-24T02:00:00.000Z', autoResolved: false, resolvedAt: null,
    resolvedBy: null, createdAt: '2026-08-24T01:00:00.000Z', updatedAt: '2026-08-24T02:00:00.000Z',
    customerName: 'Ana Cruz', providerName: 'Cebu Prime', evidence: [],
  }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', status: 'disputed', totalAmount: 100000, serviceName: 'Cabinet Repair',
    createdAt: '2026-08-23T01:00:00.000Z', customerName: 'Ana Cruz', providerName: 'Cebu Prime',
  }),
  respondToDispute: jest.fn(),
}));

import DisputeCaseScreen from '../src/components/disputes/DisputeCaseScreen';

it('Bug UX-215 — dispute help opens a valid booking-issue support request linked to the booking', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><DisputeCaseScreen role="customer" /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Contact Support' }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/support/new',
    params: {
      bookingId: 'booking-1',
      type: 'booking_issue',
      subject: 'Help with dispute DISPUTE-',
    },
  });
});
