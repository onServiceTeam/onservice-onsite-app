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

it('Bug UX-1228 - choosing create mode drops the existing case before confirming the new owner', async () => {
  const userId = '12280000-abcd-4abc-8def-000000001228';
  const ticketId = '12280000-abcd-4abc-8def-000000001229';
  apiMocks.get.mockImplementation((url: string) => {
    if (url === `/api/v1/support-tickets/account-context/${userId}`) {
      return Promise.resolve({ data: { data: {
        id: userId,
        role: 'provider',
        displayName: 'Cebu Clean Co',
        isActive: true,
        providerProfileId: '12280000-abcd-4abc-8def-000000001230',
        providerBusinessName: 'Cebu Clean Co',
      } } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/support-tickets?new=1&userId=${userId}&ticketId=${ticketId}`]}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Choose one support workspace mode')).toBeVisible();
  expect(apiMocks.get).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Create a new case' }));

  expect(await screen.findByRole('heading', { name: 'Create support request' })).toBeVisible();
  expect(screen.getAllByText('Cebu Clean Co')).toHaveLength(2);
  expect(screen.getByLabelText('New support case subject')).toBeVisible();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith(
    `/api/v1/support-tickets/account-context/${userId}`,
  ));
  const requestedUrls = apiMocks.get.mock.calls.map(([url]) => String(url));
  expect(requestedUrls).not.toContain(`/api/v1/support-tickets/${ticketId}`);
  expect(requestedUrls).not.toContain(`/api/v1/support-tickets/${ticketId}/history`);
  expect(requestedUrls.some((url) => url.startsWith('/api/v1/support-tickets?'))).toBe(false);
});
