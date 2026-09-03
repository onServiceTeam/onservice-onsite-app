import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-1220 - create-on-behalf displays and submits the server-confirmed owner instead of URL labels', async () => {
  const userId = '12200000-abcd-4abc-8def-000000001220';
  apiMocks.get.mockImplementation((url: string) => {
    if (url === `/api/v1/support-tickets/account-context/${userId}`) {
      return Promise.resolve({ data: { data: {
        id: userId,
        role: 'customer',
        displayName: 'Maria S.',
        isActive: true,
        providerProfileId: null,
        providerBusinessName: null,
      } } });
    }
    if (url === '/api/v1/support-tickets/summary') {
      return Promise.resolve({ data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } });
    }
    if (url === '/api/v1/support-tickets/agents') {
      return Promise.resolve({ data: { data: [] } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  apiMocks.post.mockResolvedValue({
    data: { data: { id: '12200000-abcd-4abc-8def-000000001221', ticket_number: 'TKT-1220' } },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/support-tickets?new=1&userId=${userId.toUpperCase()}&userName=Wrong%20Person&userRole=provider`]}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Maria S.')).toBeVisible();
  expect(screen.getByText(/customer account/)).toBeVisible();
  expect(screen.queryByText('Wrong Person')).toBeNull();
  fireEvent.change(screen.getByLabelText('New support case subject'), {
    target: { value: 'Account access follow-up' },
  });
  fireEvent.change(screen.getByLabelText('New support case description'), {
    target: { value: 'The customer asked support to review account access.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create case' }));

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
    '/api/v1/support-tickets/admin',
    expect.objectContaining({
      userId,
      subject: 'Account access follow-up',
      description: 'The customer asked support to review account access.',
    }),
  ));
});
