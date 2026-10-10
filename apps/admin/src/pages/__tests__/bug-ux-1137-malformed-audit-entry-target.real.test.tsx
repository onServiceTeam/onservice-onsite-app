import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1137 - a malformed exact audit entry target makes no request', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit-log?source=audit_log&entryId=not-a-uuid']}>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Audit entry ID must be a complete UUID.');
  expect(apiMocks.get).not.toHaveBeenCalled();
});
