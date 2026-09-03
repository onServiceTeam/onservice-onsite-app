import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetMyTicket = jest.fn().mockResolvedValue({
  id: '12320000-abcd-4abc-8def-000000001232',
  ticket_number: 'TKT-1232',
  type: 'general_inquiry',
  status: 'open',
  priority: 'medium',
  subject: 'Canonical support case',
  description: 'Please confirm this support route.',
  booking_id: null,
  project_id: null,
  created_at: '2026-09-04T01:00:00.000Z',
  updated_at: '2026-09-04T01:00:00.000Z',
  messages: [],
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: '12320000-ABCD-4ABC-8DEF-000000001232' }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { id: string; role: string } }) => unknown) => (
    selector({ user: { id: '12320000-abcd-4abc-8def-000000001233', role: 'customer' } })
  ),
}));
jest.mock('@/services/support.service', () => ({
  getMyTicket: (...args: unknown[]) => mockGetMyTicket(...args),
  addTicketMessage: jest.fn(),
  isTicketOpen: () => true,
  getSupportStatusLabel: () => 'Open',
}));

import SupportThreadScreen from '../app/support/[id]';

it('Bug UX-1232 - a valid uppercase mobile Support thread ID is canonicalized before the owner-scoped request', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SupportThreadScreen /></QueryClientProvider>);

  expect(await screen.findByText('Canonical support case')).toBeTruthy();
  await waitFor(() => expect(mockGetMyTicket).toHaveBeenCalledWith(
    '12320000-abcd-4abc-8def-000000001232',
  ));
});
