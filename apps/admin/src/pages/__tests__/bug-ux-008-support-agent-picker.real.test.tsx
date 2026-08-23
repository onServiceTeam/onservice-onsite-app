import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-008 — assigns support cases from named active agents instead of pasted UUIDs', async () => {
  const ticket = {
    id: 'ticket-1',
    ticket_number: 'TKT-1001',
    user_id: 'customer-1',
    assigned_agent_id: null,
    type: 'booking_issue',
    status: 'open',
    priority: 'high',
    subject: 'Provider has not arrived',
    description: 'Please help me contact the provider.',
    booking_id: 'booking-1',
    resolution_notes: null,
    resolved_at: null,
    closed_at: null,
    created_at: '2026-08-23T08:00:00.000Z',
    updated_at: '2026-08-23T08:00:00.000Z',
    user_first_name: 'Maria',
    user_last_name: 'S.',
    user_phone: '+63 9** *** 4567',
    messages: [],
  };

  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/agents') {
      return {
        status: 200,
        ok: true,
        data: { data: [{ id: 'agent-1', first_name: 'Ana', last_name: 'Reyes', role: 'admin' }] },
      };
    }
    if (url === '/api/v1/support-tickets/ticket-1') {
      return { status: 200, ok: true, data: { data: ticket } };
    }
    return { status: 200, ok: true, data: { data: [ticket], meta: { total: 1 } } };
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'View' }));

  const picker = await screen.findByRole('combobox', { name: 'Support agent to assign' });
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'Ana Reyes (Admin)' })).toBeTruthy(),
  );
  expect(picker).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: /Agent user ID/i })).toBeNull();
});
