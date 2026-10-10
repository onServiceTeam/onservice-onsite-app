import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const ADMIN_ACTION_ID = '11900000-0000-4abc-8def-000000001190';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ActivityTab } from '../ProviderDetailPage';

it('Bug UX-1190 - a valid uppercase provider activity UUID resolves to the canonical exact decision', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: [{
    id: `admin_action:${ADMIN_ACTION_ID}`,
    source: 'admin_action',
    action: 'provider_reactivated',
    detail: 'Canonical provider decision',
    actor: { kind: 'admin', id: 'admin-1', name: 'Support Lead' },
    ipAddress: null,
    userAgent: null,
    createdAt: '2026-09-03T13:01:00.000Z',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ActivityTab providerId="provider-1" exactAdminActionId={ADMIN_ACTION_ID.toUpperCase()} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Canonical provider decision')).toBeVisible();
  expect(screen.queryByText('Admin decision is not in this provider activity file')).not.toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledWith(
    '/api/v1/admin/providers/provider-1/activity',
    { params: { limit: 1, adminActionId: ADMIN_ACTION_ID } },
  );
});
