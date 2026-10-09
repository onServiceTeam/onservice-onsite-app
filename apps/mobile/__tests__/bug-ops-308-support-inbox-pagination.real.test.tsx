import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockListMyTickets = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-308', role: 'customer' } }),
}));
jest.mock('@/services/support.service', () => {
  const actual = jest.requireActual('@/services/support.service');
  return { ...actual, listMyTickets: (...args: unknown[]) => mockListMyTickets(...args) };
});

import SupportInboxScreen from '../app/support/index';

function ticket(id: string, subject: string) {
  return {
    id, ticket_number: `TKT-${id}`, type: 'general_inquiry', status: 'open', priority: 'medium', subject,
    description: 'Support request', booking_id: null, created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z', message_count: '0',
  };
}

it('Bug OPS-308 — customers and providers can load support requests beyond the first bounded page', async () => {
  mockListMyTickets
    .mockResolvedValueOnce({ tickets: [ticket('1308', 'Newest request')], total: 2, page: 1, limit: 20 })
    .mockResolvedValueOnce({ tickets: [ticket('0308', 'Earlier request')], total: 2, page: 2, limit: 20 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(<QueryClientProvider client={client}><SupportInboxScreen /></QueryClientProvider>);

  expect(await screen.findByText('Newest request')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Load earlier support requests' }));
  expect(await screen.findByText('Earlier request')).toBeTruthy();
  await waitFor(() => expect(mockListMyTickets).toHaveBeenNthCalledWith(2, 2, 20));
});
