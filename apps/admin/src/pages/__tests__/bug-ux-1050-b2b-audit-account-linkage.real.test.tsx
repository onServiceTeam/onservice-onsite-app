import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setSearchParamsMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setSearchParamsMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: getMock },
  getErrorMessage: (error: unknown) => String(error),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), setSearchParamsMock],
  };
});

import AuditLogPage from '../AuditLogPage';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = '22222222-2222-4222-8222-222222222222';
const INVOICE_ID = '33333333-3333-4333-8333-333333333333';

function auditEntry(
  id: string,
  entityType: string,
  entityId: string,
  newValues: Record<string, unknown> | null,
) {
  return {
    id,
    source: 'admin_actions',
    userId: '44444444-4444-4444-8444-444444444444',
    userEmail: 'o***@o***',
    userRole: 'super_admin',
    action: 'config_changed',
    entityType,
    entityId,
    oldValues: null,
    newValues,
    ipAddress: null,
    userAgent: null,
    reason: 'Controlled B2B decision',
    createdAt: '2026-09-03T00:00:00.000Z',
  };
}

beforeEach(() => {
  getMock.mockReset();
  setSearchParamsMock.mockReset();
  getMock.mockResolvedValue({
    data: {
      data: [
        auditEntry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'business_account', ACCOUNT_ID, null),
        auditEntry('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'business_contract', CONTRACT_ID, {
          businessAccountId: ACCOUNT_ID,
        }),
        auditEntry('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'business_invoice', INVOICE_ID, {
          businessAccountId: ACCOUNT_ID,
        }),
      ],
      pagination: { page: 1, pageSize: 50, total: 3, totalPages: 1 },
    },
  });
});

it('Bug UX-1050 - every first-class B2B audit target links to its owning Business Account 360', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await screen.findAllByText('Configuration changed');
  const links = Array.from(container.querySelectorAll(`a[href^="/business-accounts/${ACCOUNT_ID}"]`));
  expect(links).toHaveLength(3);
  expect(links.map((link) => link.textContent)).toEqual(expect.arrayContaining([
    expect.stringContaining('Business Account'),
    expect.stringContaining('Business Contract'),
    expect.stringContaining('Business Invoice'),
  ]));
});
