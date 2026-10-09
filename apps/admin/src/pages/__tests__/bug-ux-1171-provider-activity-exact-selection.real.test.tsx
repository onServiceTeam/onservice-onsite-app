import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const ADMIN_ACTION_ID = '31710000-0000-4000-8000-000000001171';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ActivityTab } from '../ProviderDetailPage';

it('Bug UX-1171 — an exact Provider 360 activity link requests and selects only the provider-owned admin decision', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: `admin_action:${ADMIN_ACTION_ID}`,
    source: 'admin_action',
    action: 'provider_suspended',
    detail: 'Identity risk investigation',
    actor: { kind: 'admin', id: 'admin-1', name: 'Support Lead' },
    ipAddress: null,
    userAgent: null,
    createdAt: '2026-09-03T08:00:00.000Z',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ActivityTab providerId="provider-1" exactAdminActionId={ADMIN_ACTION_ID} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Exact provider account decision')).toBeVisible();
  expect(screen.getByText('Identity risk investigation').closest('tr')).toHaveAttribute('aria-current', 'true');
  expect(screen.queryByLabelText('Provider activity row limit')).not.toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledWith(
    '/api/v1/admin/providers/provider-1/activity',
    { params: { limit: 1, adminActionId: ADMIN_ACTION_ID } },
  );
});
