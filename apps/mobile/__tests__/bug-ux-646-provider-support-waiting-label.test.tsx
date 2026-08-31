import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'provider-user-1', role: 'provider' } }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: [{
    id: 'ticket-1', ticket_number: 'SUP-0001', type: 'booking_issue', status: 'waiting_on_provider',
    priority: 'medium', subject: 'Provider schedule question', description: 'Need help', booking_id: null,
    created_at: '2026-08-31T00:00:00.000Z', updated_at: '2026-08-31T00:00:00.000Z', message_count: '1',
  }] } }) },
}));

import SupportInboxScreen from '../app/support/index';

it('Bug UX-646 — a provider-owned support case waiting on the provider says Waiting on you', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SupportInboxScreen /></QueryClientProvider>);

  expect(await screen.findByText('Waiting on you')).toBeTruthy();
  expect(screen.queryByText('Waiting on provider')).toBeNull();
});
