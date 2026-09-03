import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-1246 - Admin prevents provider-owned cases from using the customer-facing provider no-show type', async () => {
  const userId = '12460000-abcd-4abc-8def-000000001246';
  const bookingId = '12460000-abcd-4abc-8def-000000001247';
  apiMocks.get.mockResolvedValue({ data: { data: {
    id: userId,
    role: 'provider',
    displayName: 'Cebu Service Team',
    isActive: true,
    providerProfileId: '12460000-abcd-4abc-8def-000000001248',
    providerBusinessName: 'Cebu Service Team',
  } } });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/support-tickets?new=1&userId=${userId}&bookingId=${bookingId}&type=provider_no_show`]}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent(/reserved for a customer reporting/i);
  expect(screen.queryByRole('option', { name: 'Provider No Show' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Create case' })).toBeDisabled();
  expect(apiMocks.post).not.toHaveBeenCalled();
});
