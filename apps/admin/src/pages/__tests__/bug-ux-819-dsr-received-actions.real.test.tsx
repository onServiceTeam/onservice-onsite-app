import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: {
          rows: [{
            id: '00000000-0000-0000-0000-00000000abcd',
            userId: '00000000-0000-0000-0000-00000000c001',
            userEmail: 'subject@example.test',
            userRole: 'customer',
            providerProfileId: null,
            requestType: 'access',
            status: 'received',
            receivedAt: '2026-08-30T00:00:00.000Z',
            dueAt: '2026-09-14T00:00:00.000Z',
            completedAt: null,
            handledBy: null,
            userMessage: 'Please provide my account data.',
            adminNotes: null,
            responsePayloadUrl: null,
            rejectionReason: null,
            daysUntilDue: 14,
            isOverdue: false,
          }],
          total: 1,
        },
      },
    }),
    post: vi.fn(),
  },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'dpo' } }),
}));

import DataProtectionLogPage from '../DataProtectionLogPage';

it('Bug UX-819 — a received DSR offers Start review but not premature completion', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}><DataProtectionLogPage /></QueryClientProvider>
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Review data request 0000abcd' }));
  expect(screen.getByRole('button', { name: 'Start review' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
});
