import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getMyDisputes: jest.fn().mockResolvedValue({
    disputes: [{
      id: 'dispute-1', bookingId: 'booking-1', filedBy: 'customer-1', type: 'damage',
      description: 'Damage claim', status: 'open', tier: 1, assignedTo: null,
      resolutionType: null, refundAmount: 0, refundPercent: null, decisionNotes: null,
      providerResponse: null, providerRespondedAt: null, autoResolved: false,
      resolvedAt: null, resolvedBy: null, createdAt: '2026-08-24T01:00:00.000Z',
      updatedAt: '2026-08-24T01:00:00.000Z', customerName: 'Ana Cruz', providerName: 'Cebu Prime',
    }],
    page: 1,
    total: 1,
    totalPages: 1,
  }),
}));

import DisputeInbox from '../src/components/disputes/DisputeInbox';

it('Bug UX-212 — a phone dispute card sizes to its content instead of inheriting the desktop 420px flex basis', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><DisputeInbox role="customer" /></QueryClientProvider>);

  const card = await screen.findByRole('button', { name: 'Open dispute dispute-1' });
  expect((card as HTMLElement).style.flexBasis).toBe('');
  expect(screen.getByText('Property damage')).toBeTruthy();
});
