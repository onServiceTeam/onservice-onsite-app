import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ActivityTab } from '../ProviderDetailPage';

it('Bug UX-1173 — Provider 360 refuses to substitute mismatched activity for an exact admin decision', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: 'admin_action:41730000-0000-4000-8000-000000001173',
    source: 'admin_action',
    action: 'provider_reactivated',
    detail: 'Different provider decision',
    actor: { kind: 'admin', id: 'admin-1', name: 'Support Lead' },
    ipAddress: null,
    userAgent: null,
    createdAt: '2026-09-03T08:00:00.000Z',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ActivityTab
        providerId="provider-1"
        exactAdminActionId="51730000-0000-4000-8000-000000001173"
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('No substitute activity is shown');
  expect(screen.queryByText('Different provider decision')).not.toBeInTheDocument();
  expect(screen.queryByText('Exact provider account decision')).not.toBeInTheDocument();
});
