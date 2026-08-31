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

import DataProtectionLogPage from '../DataProtectionLogPage';

it('Bug UX-805 — DPO reviews the subject message and aligned action rules before deciding a case', async () => {
  apiGet.mockResolvedValue({
    data: {
      data: {
        rows: [{
          id: '00000000-0000-0000-0000-00000000abcd',
          userId: '00000000-0000-0000-0000-00000000c001',
          userEmail: 'subject@example.test',
          userRole: 'customer',
          providerProfileId: null,
          requestType: 'correction',
          status: 'in_progress',
          receivedAt: '2026-08-30T00:00:00.000Z',
          dueAt: '2026-09-14T00:00:00.000Z',
          completedAt: null,
          handledBy: null,
          userMessage: 'My family name is misspelled on the account.',
          adminNotes: 'Identity check is still pending.',
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
      <QueryClientProvider client={client}><DataProtectionLogPage /></QueryClientProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByText(/current internal 15-day response target/i)).toBeVisible();
  fireEvent.click(await screen.findByRole('button', { name: 'Review data request 0000abcd' }));
  expect(screen.getByText('My family name is misspelled on the account.')).toBeVisible();
  expect(screen.getByText('Identity check is still pending.')).toBeVisible();
  expect(screen.getByText(/open subject 360 record/i).closest('a')).toHaveAttribute(
    'to',
    '/customers/00000000-0000-0000-0000-00000000c001',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  expect(screen.getByText(/30 to 5,000 characters/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reject request' })).toBeDisabled();
});
