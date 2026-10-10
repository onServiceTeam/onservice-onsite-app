import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ActivityTab } from '../CustomerDetailPage';

it('Bug UX-1168 — Customer 360 refuses to substitute mismatched activity for an exact admin decision', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: 'admin_action:51680000-0000-4000-8000-000000001168',
    source: 'admin_action',
    action: 'customer_reactivated',
    detail: 'Different customer decision',
    actor: { kind: 'admin', id: 'admin-1', name: 'Support Lead' },
    ipAddress: null,
    userAgent: null,
    createdAt: '2026-09-03T07:00:00.000Z',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ActivityTab
        customerId="customer-1"
        exactAdminActionId="61680000-0000-4000-8000-000000001168"
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('No substitute activity is shown');
  expect(screen.queryByText('Different customer decision')).not.toBeInTheDocument();
  expect(screen.queryByText('Exact customer account decision')).not.toBeInTheDocument();
});
