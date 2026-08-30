import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ActivityTab } from '../CustomerDetailPage';

it('Bug UX-449 — Customer 360 activity renders the responsible actor and available client fingerprint', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: [{
    id: 'audit:audit-1', source: 'audit', action: 'profile_updated', detail: '{"city":"Cebu City"}',
    actor: { kind: 'customer', id: 'customer-1', name: 'Ana Reyes' },
    ipAddress: '10.1.2.3', userAgent: 'onService/1.0 (Android 15)',
    createdAt: '2026-08-30T01:00:00.000Z',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ActivityTab customerId="customer-1" />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Ana Reyes')).toBeVisible();
  expect(screen.getByText('customer · customer…')).toBeVisible();
  expect(screen.getByText('onService/1.0 (Android 15)')).toBeVisible();
});
