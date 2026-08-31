import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-702 — a closed case offers only a private post-closure note, never a participant-visible reply', async () => {
  const ticket = {
    id: 'ticket-1', ticket_number: 'TKT-4003', user_id: 'customer-1', assigned_agent_id: 'agent-1',
    type: 'general_inquiry', status: 'closed', priority: 'medium', subject: 'Account question',
    description: 'Customer asked about account access.', booking_id: null, resolution_notes: 'Account access was restored.',
    resolved_at: null, closed_at: '2026-08-31T02:00:00.000Z', created_at: '2026-08-31T01:00:00.000Z',
    updated_at: '2026-08-31T02:00:00.000Z', user_role: 'customer', user_first_name: 'Maria',
    user_last_name: 'S.', agent_first_name: 'Ana', agent_last_name: 'Reyes', messages: [],
  };
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') return { data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } } as never;
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    if (url === '/api/v1/support-tickets/ticket-1') return { data: { data: ticket } } as never;
    if (url === '/api/v1/support-tickets/ticket-1/history') return { data: { data: [] } } as never;
    return { data: { data: [ticket], meta: { total: 1 } } } as never;
  });
  vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 'message-1' } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'View' }));
  expect(await screen.findByText(/Participant-visible replies are locked/)).toBeTruthy();
  expect(screen.queryByLabelText('Reply message')).toBeNull();
  fireEvent.change(screen.getByLabelText('Internal note'), { target: { value: 'Documenting the final callback outcome.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save internal note' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/v1/support-tickets/ticket-1/messages', {
    message: 'Documenting the final callback outcome.', isInternalNote: true,
  }));
});
