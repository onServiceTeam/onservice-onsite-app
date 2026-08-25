import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-428 — customer support cases offer only the waiting state that their customer owner can resume', async () => {
  const ticket = {
    id: 'ticket-1', ticket_number: 'TKT-3002', user_id: 'customer-1', assigned_agent_id: null,
    type: 'general_inquiry', status: 'open', priority: 'medium', subject: 'Need account help',
    description: 'Customer needs an answer.', booking_id: null, resolution_notes: null, resolved_at: null,
    closed_at: null, created_at: '2026-08-24T08:00:00.000Z', updated_at: '2026-08-24T08:00:00.000Z',
    user_role: 'customer', user_first_name: 'Maria', user_last_name: 'S.', messages: [],
  };
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') return { data: { data: { open: 1, escalated: 0, urgent: 0, unassigned: 1 } } } as never;
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    if (url === '/api/v1/support-tickets/ticket-1/history') return { data: { data: [] } } as never;
    if (url === '/api/v1/support-tickets/ticket-1') return { data: { data: ticket } } as never;
    return { data: { data: [ticket], meta: { total: 1 } } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'View' }));
  const status = await screen.findByRole('combobox', { name: 'Change support ticket status' });
  expect(status).toContainElement(screen.getByRole('option', { name: 'Waiting On Customer' }));
  expect(screen.queryByRole('option', { name: 'Waiting On Provider' })).toBeNull();
});
