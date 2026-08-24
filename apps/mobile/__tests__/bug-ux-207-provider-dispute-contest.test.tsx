import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRespond = jest.fn().mockResolvedValue({ id: 'dispute-1', status: 'under_review' });
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'dispute-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getDisputeById: jest.fn().mockResolvedValue({
    id: 'dispute-1', bookingId: 'booking-1', filedBy: 'customer-1', type: 'incomplete',
    description: 'The customer says the booked work was not finished before the provider left the property.',
    status: 'open', tier: 1, assignedTo: null, resolutionType: null, refundAmount: 0,
    refundPercent: null, decisionNotes: null, providerResponse: null, providerRespondedAt: null,
    autoResolved: false, resolvedAt: null, resolvedBy: null,
    createdAt: '2026-08-24T01:00:00.000Z', updatedAt: '2026-08-24T01:00:00.000Z',
    customerName: 'Ana Cruz', providerName: 'Cebu Prime', evidence: [],
  }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', status: 'disputed', totalAmount: 100000, serviceName: 'Cabinet Repair',
    createdAt: '2026-08-23T01:00:00.000Z', customerName: 'Ana Cruz', providerName: 'Cebu Prime',
  }),
  respondToDispute: (...args: unknown[]) => mockRespond(...args),
}));

import DisputeCaseScreen from '../src/components/disputes/DisputeCaseScreen';

it('Bug UX-207 — the provider can submit a factual contest into the support review queue', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><DisputeCaseScreen role="provider" /></QueryClientProvider>);

  const response = await screen.findByLabelText('Provider dispute response');
  fireEvent.change(response, { target: { value: 'I completed the agreed repair and have timestamps for support to review.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review Response' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Contest Claim' }));

  await waitFor(() => expect(mockRespond).toHaveBeenCalledWith('dispute-1', {
    action: 'contest',
    response: 'I completed the agreed repair and have timestamps for support to review.',
  }));
});
