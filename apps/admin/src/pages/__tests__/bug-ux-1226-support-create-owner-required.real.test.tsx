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

it('Bug UX-1226 - create mode without an account fails closed and preserves linked work when returning to the queue', async () => {
  const bookingId = '12260000-abcd-4abc-8def-000000001226';
  apiMocks.get.mockImplementation((url: string) => {
    if (url === '/api/v1/support-tickets/summary') {
      return Promise.resolve({ data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } });
    }
    if (url.startsWith('/api/v1/support-tickets?')) {
      return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/support-tickets?new=1&bookingId=${bookingId}`]}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Support case owner required')).toBeVisible();
  expect(screen.queryByLabelText('New support case subject')).toBeNull();
  expect(apiMocks.get).not.toHaveBeenCalled();
  expect(apiMocks.post).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Return to linked queue' }));

  await waitFor(() => expect(apiMocks.get.mock.calls.some(
    ([url]) => String(url).startsWith('/api/v1/support-tickets?') && String(url).includes(`bookingId=${bookingId}`),
  )).toBe(true));
  expect(screen.getByText('Support Queue')).toBeVisible();
});
