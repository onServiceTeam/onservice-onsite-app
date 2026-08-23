import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-066 — support reply composer shows the message length before an agent sends', async () => {
  const ticket = {
    id: 'ticket-1',
    ticket_number: 'TKT-2002',
    user_id: 'customer-1',
    assigned_agent_id: null,
    type: 'general_inquiry',
    status: 'open',
    priority: 'medium',
    subject: 'Need help',
    description: 'Please help with my account.',
    booking_id: null,
    resolution_notes: null,
    resolved_at: null,
    closed_at: null,
    created_at: '2026-08-24T08:00:00.000Z',
    updated_at: '2026-08-24T08:00:00.000Z',
    user_role: 'customer',
    user_first_name: 'Maria',
    user_last_name: 'S.',
    messages: [],
  };
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    if (url === '/api/v1/support-tickets/ticket-1') return { data: { data: ticket } } as never;
    return { data: { data: [ticket], meta: { total: 1 } } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'View' }));
  fireEvent.change(await screen.findByLabelText('Reply message'), { target: { value: 'Hello there' } });
  expect(screen.getByText('11 / 5000 characters')).toBeTruthy();
});
