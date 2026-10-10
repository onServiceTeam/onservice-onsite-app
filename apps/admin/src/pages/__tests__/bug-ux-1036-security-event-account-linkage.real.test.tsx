import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn((url: string) => {
  if (url.endsWith('/blocked-ips')) {
    return Promise.resolve({
      data: { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
    });
  }
  return Promise.resolve({
    data: {
      data: [
        {
          id: 'customer-event',
          userId: '13600000-0000-4000-8000-000000001036',
          userRole: 'customer',
          userName: 'Customer One',
          userEmail: 'customer@example.com',
          providerProfileId: null,
          eventType: 'new_device_login',
          ipAddress: '203.0.113.136',
          deviceFingerprint: 'device-customer',
          metadata: {},
          createdAt: '2026-09-03T00:00:00.000Z',
        },
        {
          id: 'staff-event',
          userId: '23600000-0000-4000-8000-000000001036',
          userRole: 'provider_staff',
          userName: 'Provider Staff One',
          userEmail: 'staff@example.com',
          providerProfileId: '33600000-0000-4000-8000-000000001036',
          eventType: 'refresh_token_fingerprint_mismatch',
          ipAddress: '203.0.113.236',
          deviceFingerprint: 'device-staff',
          metadata: {},
          createdAt: '2026-09-03T01:00:00.000Z',
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    },
  });
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn() },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

import SecurityOperationsPage from '../SecurityOperationsPage';

it('Bug UX-1036 — security events identify people and open the correct customer or employing-provider record', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SecurityOperationsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/Customer · Customer One/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open Customer 360' })).toHaveAttribute(
    'href',
    '/customers/13600000-0000-4000-8000-000000001036',
  );
  expect(screen.getByText(/Provider staff · Provider Staff One/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open employing Provider 360' })).toHaveAttribute(
    'href',
    '/providers/33600000-0000-4000-8000-000000001036',
  );
});
