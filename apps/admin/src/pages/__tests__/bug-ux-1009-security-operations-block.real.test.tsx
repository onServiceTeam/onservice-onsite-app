import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

import SecurityOperationsPage from '../SecurityOperationsPage';

it('Bug UX-1009 — Security Operations submits a manual IP block with the selected duration and audit reason', async () => {
  apiMocks.get.mockResolvedValue({
    data: {
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    },
  });
  apiMocks.post.mockResolvedValue({ data: { success: true } });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SecurityOperationsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('No active IP blocks')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Block an address' }));
  expect(screen.getByRole('dialog', { name: 'Block an IP address' })).toBeVisible();

  fireEvent.change(screen.getByLabelText('IP address'), {
    target: { value: '2001:db8::1009' },
  });
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '72' } });
  fireEvent.change(screen.getByLabelText('Audit reason'), {
    target: { value: 'Repeated credential attacks confirmed in the security event timeline.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm block' }));

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
    '/api/v1/admin/blocked-ips',
    {
      ipAddress: '2001:db8::1009',
      expiresInHours: 72,
      reason: 'Repeated credential attacks confirmed in the security event timeline.',
    },
  ));
  expect(await screen.findByText(/Address blocked and recorded/i)).toBeVisible();
});
