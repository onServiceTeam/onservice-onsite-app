import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn((url: string) => {
  if (url.includes('dsr-alerts')) {
    return Promise.resolve({
      data: {
        data: [
          { id: 'overdue-1', requestType: 'access', dueAt: '2026-08-31T00:00:00.000Z', daysUntilDue: -2, isOverdue: true },
          { id: 'upcoming-1', requestType: 'erasure', dueAt: '2026-09-03T00:00:00.000Z', daysUntilDue: 1, isOverdue: false },
          { id: 'upcoming-2', requestType: 'correction', dueAt: '2026-09-04T00:00:00.000Z', daysUntilDue: 2, isOverdue: false },
        ],
      },
    });
  }
  return Promise.resolve({ data: { data: { rows: [], total: 0 } } });
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));

import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

it('Bug UX-1033 — privacy workload separates upcoming cases from overdue cases and links each queue', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PrivacyWorkspacePage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const upcoming = screen.getByLabelText('Upcoming internal target workload');
  const overdue = screen.getByLabelText('Overdue internal target workload');
  expect(await within(upcoming).findByText('2')).toBeVisible();
  expect(within(overdue).getByText('1')).toBeVisible();
  expect(within(upcoming).getByRole('link', { name: /review upcoming cases/i })).toHaveAttribute('href', '/data-protection-log');
  expect(within(overdue).getByRole('link', { name: /review overdue cases/i })).toHaveAttribute('href', '/data-protection-log?overdueOnly=true');
});
