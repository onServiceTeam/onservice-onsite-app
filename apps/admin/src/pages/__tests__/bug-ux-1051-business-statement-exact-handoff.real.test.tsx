import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = '22222222-2222-4222-8222-222222222222';
const INVOICE_ID = '33333333-3333-4333-8333-333333333333';

const { getMock, routerState, setSearchParamsMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  routerState: {
    search: '',
  },
  setSearchParamsMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: getMock, post: vi.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => (
    selector({ user: { role: 'admin' } })
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: ACCOUNT_ID }),
    useSearchParams: () => [new URLSearchParams(routerState.search), setSearchParamsMock],
  };
});

import BusinessAccountDetailPage from '../BusinessAccountDetailPage';
import AuditLogPage from '../AuditLogPage';

const account = {
  id: ACCOUNT_ID,
  companyName: 'Cebu Build Co',
  businessType: 'corporation',
  registrationNumber: null,
  taxId: null,
  billingAddress: 'Cebu Business Park',
  barangay: 'Lahug',
  city: 'Cebu City',
  province: 'Cebu',
  contactPerson: 'Account Owner',
  contactEmail: 'owner@example.test',
  contactPhone: '+639170000000',
  accountManagerId: null,
  ownerUserId: '55555555-5555-4555-8555-555555555555',
  status: 'active',
  paymentTerms: 'net_30',
  volumeDiscountRate: 0,
  monthlyCreditLimit: 5_000_000,
  notes: null,
  recordVersion: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

beforeEach(() => {
  getMock.mockReset();
  setSearchParamsMock.mockReset();
  routerState.search = '';
  getMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') {
      return {
        data: {
          data: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              source: 'admin_actions',
              userId: '44444444-4444-4444-8444-444444444444',
              userEmail: 'o***@o***',
              userRole: 'super_admin',
              action: 'config_changed',
              entityType: 'business_contract',
              entityId: CONTRACT_ID,
              oldValues: null,
              newValues: { businessAccountId: ACCOUNT_ID },
              ipAddress: null,
              userAgent: null,
              reason: 'Controlled contract decision',
              createdAt: '2026-09-03T00:00:00.000Z',
            },
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              source: 'admin_actions',
              userId: '44444444-4444-4444-8444-444444444444',
              userEmail: 'o***@o***',
              userRole: 'super_admin',
              action: 'config_changed',
              entityType: 'business_invoice',
              entityId: INVOICE_ID,
              oldValues: null,
              newValues: { businessAccountId: ACCOUNT_ID },
              ipAddress: null,
              userAgent: null,
              reason: 'Controlled statement decision',
              createdAt: '2026-09-03T00:01:00.000Z',
            },
          ],
          pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
        },
      };
    }
    if (url === `/api/v1/admin/business-accounts/${ACCOUNT_ID}`) {
      return { data: { success: true, data: account } };
    }
    if (url === `/api/v1/admin/business-accounts/${ACCOUNT_ID}/invoices`) {
      return {
        data: {
          success: true,
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
      };
    }
    if (url === `/api/v1/admin/invoices/${INVOICE_ID}`) {
      return new Promise(() => undefined);
    }
    throw new Error(`Unexpected GET ${url}`);
  });
});

it('Bug UX-1051 - B2B audit handoffs preserve contract or exact statement context', async () => {
  const auditClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const audit = render(
    <QueryClientProvider client={auditClient}>
      <MemoryRouter>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await screen.findAllByText('Configuration changed');
  expect(audit.container.querySelector(
    `a[href="/business-accounts/${ACCOUNT_ID}?tab=contracts&contractId=${CONTRACT_ID}"]`,
  )).not.toBeNull();
  expect(audit.container.querySelector(
    `a[href="/business-accounts/${ACCOUNT_ID}?tab=invoices&invoiceId=${INVOICE_ID}"]`,
  )).not.toBeNull();
  audit.unmount();

  routerState.search = `tab=invoices&invoiceId=${INVOICE_ID}`;
  const accountClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={accountClient}>
      <MemoryRouter>
        <BusinessAccountDetailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('tab', { name: 'Invoices' })).toHaveAttribute('data-state', 'active');
  expect(await screen.findByLabelText('Invoice booking detail')).toBeInTheDocument();
  await waitFor(() => {
    expect(getMock).toHaveBeenCalledWith(`/api/v1/admin/invoices/${INVOICE_ID}`);
  });
});
