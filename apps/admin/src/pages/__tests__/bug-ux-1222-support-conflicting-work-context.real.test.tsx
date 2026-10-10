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

it('Bug UX-1222 - conflicting support work contexts fail closed until the operator selects one context', async () => {
  const userId = '12220000-abcd-4abc-8def-000000001222';
  const bookingId = '12220000-abcd-4abc-8def-000000001224';
  const projectId = '12220000-abcd-4abc-8def-000000001225';
  const businessAccountId = '12220000-abcd-4abc-8def-000000001226';
  apiMocks.get.mockImplementation((url: string) => {
    if (url === '/api/v1/support-tickets/summary') {
      return Promise.resolve({ data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } });
    }
    if (url === '/api/v1/support-tickets/agents') {
      return Promise.resolve({ data: { data: [] } });
    }
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
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const initialEntry = `/support-tickets?new=1&userId=${userId}&bookingId=${bookingId}&projectId=${projectId}&businessAccountId=${businessAccountId}&businessName=Cebu%20Build%20Co`;

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Conflicting support work context')).toBeVisible();
  const blockedUrls = apiMocks.get.mock.calls.map(([url]) => url as string);
  expect(blockedUrls.some((url) => url.startsWith('/api/v1/support-tickets?'))).toBe(false);
  expect(blockedUrls).not.toContain(`/api/v1/support-tickets/account-context/${userId}`);
  expect(apiMocks.post).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Use booking context' }));

  expect(await screen.findByText('Maria S.')).toBeVisible();
  expect(screen.getByText(/Linked booking:/)).toHaveTextContent(bookingId);
  expect(screen.getByText(/Linked business account:/)).toHaveTextContent('Cebu Build Co');
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith(
    `/api/v1/support-tickets/account-context/${userId}`,
  ));
});
