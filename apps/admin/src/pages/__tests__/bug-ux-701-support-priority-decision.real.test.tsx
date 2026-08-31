import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-701 — agents can review and record a reasoned support priority decision', async () => {
  const ticket = {
    id: 'ticket-1', ticket_number: 'TKT-4002', user_id: 'customer-1', assigned_agent_id: 'agent-1',
    type: 'payment_issue', status: 'in_progress', priority: 'medium', subject: 'Payment needs review',
    description: 'Customer reported a duplicate authorization.', booking_id: 'booking-1', resolution_notes: null,
    resolved_at: null, closed_at: null, created_at: '2026-08-31T01:00:00.000Z',
    updated_at: '2026-08-31T01:00:00.000Z', user_role: 'customer', user_first_name: 'Maria',
    user_last_name: 'S.', agent_first_name: 'Ana', agent_last_name: 'Reyes', messages: [],
  };
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') return { data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } } as never;
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    if (url === '/api/v1/support-tickets/ticket-1') return { data: { data: ticket } } as never;
    if (url === '/api/v1/support-tickets/ticket-1/history') return { data: { data: [{
      id: 'audit-1', createdAt: '2026-08-31T01:30:00.000Z', adminName: 'Ana Reyes', adminRole: 'admin',
      previousStatus: null, nextStatus: null, previousPriority: 'low', nextPriority: 'medium',
      workflowNote: 'Payment evidence required a faster review.', resolutionNotes: null,
      decisionSource: 'admin_priority_change',
    }] } } as never;
    return { data: { data: [ticket], meta: { total: 1 } } } as never;
  });
  vi.mocked(api.patch).mockResolvedValue({ data: { data: { ...ticket, priority: 'urgent' } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'View' }));
  expect(await screen.findByText('Low → Medium')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Change support ticket priority' }), { target: { value: 'urgent' } });
  fireEvent.change(screen.getByLabelText('Triage reason *'), { target: { value: 'Payment proof shows an immediate duplicate charge risk.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Urgent' }));

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/v1/support-tickets/ticket-1/priority', {
    priority: 'urgent', workflowNote: 'Payment proof shows an immediate duplicate charge risk.',
  }));
});
