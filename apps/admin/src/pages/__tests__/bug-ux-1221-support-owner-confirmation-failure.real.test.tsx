import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

it('Bug UX-1221 - create-on-behalf fails closed when the server cannot confirm the selected owner', async () => {
  const userId = '12210000-abcd-4abc-8def-000000001221';
  apiMocks.get.mockImplementation((url: string) => {
    if (url === `/api/v1/support-tickets/account-context/${userId}`) {
      return Promise.reject(new Error('Account lookup failed'));
    }
    if (url === '/api/v1/support-tickets/summary') {
      return Promise.resolve({ data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } });
    }
    if (url === '/api/v1/support-tickets/agents') {
      return Promise.resolve({ data: { data: [] } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/support-tickets?new=1&userId=${userId}&userName=Unverified%20Name&userRole=customer`]}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Support case owner could not be confirmed')).toBeVisible();
  expect(screen.queryByLabelText('New support case subject')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create case' })).toBeNull();
  expect(apiMocks.post).not.toHaveBeenCalled();
});
