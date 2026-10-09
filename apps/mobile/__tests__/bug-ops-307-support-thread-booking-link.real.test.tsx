import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({ id: '30700000-abcd-4abc-8def-000000000307' }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'provider-307', role: 'provider' } }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({
      data: {
        data: {
          id: '30700000-abcd-4abc-8def-000000000307', ticket_number: 'TKT-1307', type: 'booking_issue', status: 'in_progress',
          priority: 'medium', subject: 'Job access question', description: 'Please review this job.',
          booking_id: 'booking-307', created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
          messages: [],
        },
      },
    }),
    post: jest.fn(),
  },
}));

import SupportThreadScreen, { getSupportBookingRoute } from '../app/support/[id]';

it('Bug OPS-307 — a support thread returns each participant role to the correct related work record', async () => {
  expect(getSupportBookingRoute('customer', 'booking-307')).toBe('/customer/booking/booking-307');
  expect(getSupportBookingRoute('provider_staff', 'booking-307')).toBe('/staff/job/booking-307');

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SupportThreadScreen /></QueryClientProvider>);

  const relatedJob = await screen.findByRole('button', { name: 'Open related job' });
  fireEvent.click(relatedJob);
  expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-307');
});
