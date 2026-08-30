import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('source=admin_actions'), vi.fn()],
  };
});

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [],
        pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
      },
    }),
  },
  getErrorMessage: (error: unknown) => String(error),
}));

import AuditLogPage from '../AuditLogPage';

describe('AuditLogPage filter-aware empty state', () => {
  it('BUG-PHASE108-01 — identifies an empty filtered result instead of claiming no audit history exists', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/audit-log?source=admin_actions']}>
          <AuditLogPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('No matching recorded events')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No event matches the submitted filters');
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });
});
