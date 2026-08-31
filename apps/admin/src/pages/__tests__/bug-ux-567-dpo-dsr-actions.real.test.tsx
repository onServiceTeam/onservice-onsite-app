import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'dpo' } }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useSearchParams: () => [new URLSearchParams(), vi.fn()] };
});

import DataProtectionLogPage from '../DataProtectionLogPage';

it('Bug UX-567 — appointed DPO can act on a live data-subject request', async () => {
  apiGet.mockResolvedValue({
    data: {
      data: {
        rows: [{
          id: '00000000-0000-0000-0000-00000000abcd',
          userId: 'customer-1',
          userEmail: 'customer@example.test',
          userRole: 'customer',
          providerProfileId: null,
          requestType: 'access',
          status: 'received',
          receivedAt: '2026-08-30T00:00:00.000Z',
          dueAt: '2026-09-14T00:00:00.000Z',
          completedAt: null,
          handledBy: null,
          userMessage: 'Please provide my data.',
          adminNotes: null,
          responsePayloadUrl: null,
          rejectionReason: null,
          daysUntilDue: 14,
          isOverdue: false,
        }],
        total: 1,
      },
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DataProtectionLogPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Review data request 0000abcd' }));

  expect(screen.getByText('Please provide my data.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start review' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Request info' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Record NPC case' })).toBeEnabled();
});
