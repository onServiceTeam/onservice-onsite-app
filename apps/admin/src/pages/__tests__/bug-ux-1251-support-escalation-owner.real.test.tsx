import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-1251 - an unassigned Support escalation explains the accountable handoff and cannot be confirmed', async () => {
  const ticket = {
    id: 'ticket-1251', ticket_number: 'TKT-1251', user_id: 'customer-1251', assigned_agent_id: null,
    type: 'payment_issue', status: 'in_progress', priority: 'high', subject: 'Payment review needed',
    description: 'Customer reported an unexpected payment result.', booking_id: null, project_id: null,
    business_account_id: null, resolution_notes: null, resolved_at: null, closed_at: null,
    created_at: '2026-09-04T01:00:00.000Z', updated_at: '2026-09-04T01:00:00.000Z',
    user_role: 'customer', user_first_name: 'Maria', user_last_name: 'S.', messages: [],
  };
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') return { data: { data: { open: 1, escalated: 0, urgent: 0, unassigned: 1, awaitingReply: 1 } } } as never;
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    if (url === '/api/v1/support-tickets/ticket-1251') return { data: { data: ticket } } as never;
    if (url === '/api/v1/support-tickets/ticket-1251/history') return { data: { data: [] } } as never;
    return { data: { data: [ticket], meta: { total: 1 } } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'View' }));
  fireEvent.change(await screen.findByRole('combobox', { name: 'Change support ticket status' }), { target: { value: 'escalated' } });

  expect(await screen.findByText(/assigned case owner remains accountable until reassigned/i)).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent(/assign an active case owner before escalating/i);
  fireEvent.change(screen.getByLabelText('Escalation handoff *'), {
    target: { value: 'Finance must review evidence and decide the next payment action.' },
  });
  expect(screen.getByRole('button', { name: 'Confirm Escalated' })).toBeDisabled();
  expect(api.patch).not.toHaveBeenCalled();
});
