import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'dispute-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getDisputeById: jest.fn().mockResolvedValue({
    id: 'dispute-1', bookingId: 'booking-1', filedBy: 'customer-1', type: 'damage',
    description: 'The cabinet door was damaged while the provider was completing the booked repair.',
    status: 'open', tier: 1, assignedTo: null, resolutionType: null, refundAmount: 0,
    refundPercent: null, decisionNotes: null, providerResponse: null, providerRespondedAt: null,
    autoResolved: false, resolvedAt: null, resolvedBy: null,
    createdAt: '2026-08-24T01:00:00.000Z', updatedAt: '2026-08-24T01:00:00.000Z',
    customerName: 'Ana Cruz', providerName: 'Cebu Prime',
    evidence: [{ id: 'evidence-1', evidenceType: 'photo', fileUrl: 'https://cdn.example/damage.jpg', createdAt: '2026-08-24T01:00:00.000Z' }],
  }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', status: 'disputed', totalAmount: 100000, serviceName: 'Cabinet Repair',
    createdAt: '2026-08-23T01:00:00.000Z', customerName: 'Ana Cruz', providerName: 'Cebu Prime',
  }),
  respondToDispute: jest.fn(),
}));

import DisputeCaseScreen from '../src/components/disputes/DisputeCaseScreen';

it('Bug UX-206 — dispute detail keeps the case record beside participant actions on tablet and desktop', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><DisputeCaseScreen role="provider" /></QueryClientProvider>);

  const workspace = await screen.findByLabelText('Wide provider dispute case workspace');
  const actions = screen.getByLabelText('Dispute status and actions');
  expect(workspace.contains(actions)).toBe(true);
  expect(screen.getByText('The cabinet door was damaged while the provider was completing the booked repair.')).toBeTruthy();
  expect(screen.getByText('Refund settlements are handled by support')).toBeTruthy();
});
