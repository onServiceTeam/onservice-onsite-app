import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-1055 - the support workspace preserves company filtering and returns to Business Account 360', async () => {
  const ticket = {
    id: '33333333-3333-4333-8333-333333333333', ticket_number: 'TKT-1042',
    user_id: '22222222-2222-4222-8222-222222222222', assigned_agent_id: null,
    type: 'account_issue', status: 'open', priority: 'high', subject: 'Company account access',
    description: 'The company owner cannot open consolidated history.', booking_id: null,
    project_id: null, business_account_id: '11111111-1111-4111-8111-111111111111',
    related_business_account_id: '11111111-1111-4111-8111-111111111111',
    business_account_name: 'Cebu Build Co', business_account_status: 'active',
    resolution_notes: null, resolved_at: null, closed_at: null,
    created_at: '2026-09-03T00:00:00.000Z', updated_at: '2026-09-03T01:00:00.000Z',
    user_role: 'customer', user_first_name: 'Andrea', user_last_name: 'R.', messages: [], message_count: 0,
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') {
      return { data: { data: { open: 1, escalated: 0, urgent: 0, unassigned: 1 } } };
    }
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } };
    if (url.endsWith('/history')) return { data: { data: [] } };
    if (url === '/api/v1/support-tickets/33333333-3333-4333-8333-333333333333') {
      return { data: { data: ticket } };
    }
    return { data: { data: [ticket], meta: { total: 1 } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[
        '/support-tickets?businessAccountId=11111111-1111-4111-8111-111111111111&businessName=Cebu%20Build%20Co&ticketId=33333333-3333-4333-8333-333333333333',
      ]}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: 'Cebu Build Co' })).toHaveAttribute(
    'href', '/business-accounts/11111111-1111-4111-8111-111111111111',
  );
  expect(screen.getByText('Active')).toBeVisible();
  expect(apiMocks.get.mock.calls.some(
    ([url]) => String(url).startsWith('/api/v1/support-tickets?'),
  )).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: /Back to support queue/ }));

  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith(expect.stringContaining(
    'businessAccountId=11111111-1111-4111-8111-111111111111',
  )));
});
