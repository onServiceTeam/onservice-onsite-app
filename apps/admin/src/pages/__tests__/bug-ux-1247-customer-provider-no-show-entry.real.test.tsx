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

it('Bug UX-1247 - Admin preserves provider no-show intake for a customer with the affected booking', async () => {
  const userId = '12470000-abcd-4abc-8def-000000001247';
  const bookingId = '12470000-abcd-4abc-8def-000000001248';
  apiMocks.get.mockResolvedValue({ data: { data: {
    id: userId,
    role: 'customer',
    displayName: 'Maria S.',
    isActive: true,
    providerProfileId: null,
    providerBusinessName: null,
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

  expect(await screen.findByText('Maria S.')).toBeVisible();
  expect(screen.getByRole('option', { name: 'Provider No Show' })).toBeVisible();
  expect(screen.getByLabelText('New support case type')).toHaveValue('provider_no_show');
  expect(screen.queryByText(/Provider no-show must be linked/i)).toBeNull();
});
