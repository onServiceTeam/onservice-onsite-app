import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

const supportParams = new URLSearchParams(
  'new=1&userId=11111111-1111-4111-8111-111111111111&userRole=customer&userName=Maria%20Santos',
);
const setSearchParamsMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const ReactModule = await import('react');
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [supportParams, setSearchParamsMock],
    Link: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement('a', props, children),
  };
});

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-063 — admin can record an off-app contact as a case owned by the selected account', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/account-context/11111111-1111-4111-8111-111111111111') {
      return { data: { data: {
        id: '11111111-1111-4111-8111-111111111111',
        role: 'customer',
        displayName: 'Maria S.',
        isActive: true,
        providerProfileId: null,
        providerBusinessName: null,
      } } } as never;
    }
    if (url === '/api/v1/support-tickets/summary') return { data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } } as never;
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    if (url === '/api/v1/support-tickets/ticket-1/history') return { data: { data: [] } } as never;
    return { data: { data: [], meta: { total: 0 } } } as never;
  });
  vi.mocked(api.post).mockResolvedValueOnce({ data: { data: { id: 'ticket-1' } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  expect(await screen.findByText(/Maria S\./)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('New support case subject'), { target: { value: 'Messenger follow-up' } });
  fireEvent.change(screen.getByLabelText('New support case description'), { target: { value: 'Customer asked for help through Messenger.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create case' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/v1/support-tickets/admin', {
    userId: '11111111-1111-4111-8111-111111111111',
    type: 'general_inquiry',
    priority: 'medium',
    subject: 'Messenger follow-up',
    description: 'Customer asked for help through Messenger.',
  }));
});
