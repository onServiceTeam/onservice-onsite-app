import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-419 — support agents can review status rationale and reopen a closed case with a new audited note', async () => {
  const ticket = {
    id: 'ticket-1', ticket_number: 'TKT-3001', user_id: 'customer-1', assigned_agent_id: 'agent-1',
    type: 'booking_issue', status: 'closed', priority: 'high', subject: 'Provider did not arrive',
    description: 'Customer needs a follow-up.', booking_id: 'booking-1',
    resolution_notes: 'Original closure was confirmed.', resolved_at: null,
    closed_at: '2026-08-24T09:00:00.000Z', created_at: '2026-08-24T08:00:00.000Z',
    updated_at: '2026-08-24T09:00:00.000Z', user_role: 'customer', user_first_name: 'Maria',
    user_last_name: 'S.', agent_first_name: 'Ana', agent_last_name: 'Reyes', messages: [],
  };
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') return { data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } } as never;
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    if (url === '/api/v1/support-tickets/ticket-1/history') {
      return { data: { data: [{
        id: 'audit-1', createdAt: '2026-08-24T09:00:00.000Z', adminName: 'Ana Reyes', adminRole: 'admin',
        previousStatus: 'in_progress', nextStatus: 'closed', workflowNote: 'Customer confirmed the replacement visit.',
        resolutionNotes: 'Original closure was confirmed.',
      }] } } as never;
    }
    if (url === '/api/v1/support-tickets/ticket-1') return { data: { data: ticket } } as never;
    return { data: { data: [ticket], meta: { total: 1 } } } as never;
  });
  vi.mocked(api.patch).mockResolvedValue({ data: { data: { ...ticket, status: 'open' } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'View' }));
  expect(await screen.findByText('Customer confirmed the replacement visit.')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Change support ticket status' }), { target: { value: 'open' } });
  expect(screen.getByText('Returns the case to the intake queue. This action does not send a user message.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Workflow note *'), { target: { value: 'Customer replied and still needs support.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Open' }));

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/v1/support-tickets/ticket-1/status', {
    status: 'open',
    workflowNote: 'Customer replied and still needs support.',
  }));
});
