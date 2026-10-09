import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const REQUESTED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WRONG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1138 - a mismatched exact audit response is hidden instead of substituted', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { data: [{
    id: WRONG_ID, source: 'audit_log', userId: null, userEmail: null, userRole: null,
    action: 'wrong.event', entityType: 'booking', entityId: WRONG_ID,
    oldValues: null, newValues: null, ipAddress: null, userAgent: null, reason: null,
    createdAt: '2026-09-03T09:00:00.000Z',
  }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/audit-log?source=audit_log&entryId=${REQUESTED_ID}`]}>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The server response did not match the requested audit event. No substitute event is shown.',
  );
  expect(screen.queryByText('wrong.event')).not.toBeInTheDocument();
  expect(screen.queryByText(WRONG_ID)).not.toBeInTheDocument();
});
