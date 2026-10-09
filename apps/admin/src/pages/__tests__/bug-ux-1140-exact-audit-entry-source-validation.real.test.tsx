import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const ENTRY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1140 - an exact audit entry target without its source makes no request', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/audit-log?entryId=${ENTRY_ID}`]}>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent(
    'An exact audit event link must include its recorded source.',
  );
  expect(apiMocks.get).not.toHaveBeenCalled();
});
