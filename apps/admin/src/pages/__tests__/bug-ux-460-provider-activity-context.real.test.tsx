import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ActivityTab } from '../ProviderDetailPage';

it('Bug UX-460 — Provider 360 activity shows the responsible actor, admin reason, and available client fingerprint', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: [{
    id: 'admin_action:1', source: 'admin_action', action: 'provider_suspended',
    detail: 'Support case OS-772 confirmed identity risk.',
    actor: { kind: 'admin', id: 'admin-12345678', name: 'Support Lead' },
    ipAddress: null, userAgent: null, createdAt: '2026-08-30T01:00:00.000Z',
  }, {
    id: 'audit:2', source: 'audit', action: 'profile_updated', detail: '{"city":"Cebu City"}',
    actor: { kind: 'provider', id: 'provider-user-1', name: 'Paolo Santos' },
    ipAddress: '10.1.2.0/24', userAgent: 'Mobile app', createdAt: '2026-08-29T01:00:00.000Z',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><ActivityTab providerId="provider-1" /></QueryClientProvider>);

  expect(await screen.findByText('Support Lead')).toBeVisible();
  expect(screen.getByText('Support case OS-772 confirmed identity risk.')).toBeVisible();
  expect(screen.getByText('Paolo Santos')).toBeVisible();
  expect(screen.getByText('Mobile app')).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Provider activity row limit' })).toHaveValue('50');
});
