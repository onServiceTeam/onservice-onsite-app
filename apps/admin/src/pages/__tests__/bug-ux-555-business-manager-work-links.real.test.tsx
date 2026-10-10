import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import { BillingSettingsCard } from '../BusinessAccountDetailPage';

it('Bug UX-555 — Business 360 identifies the current manager and links directly to staff, owned support cases, and assignment audit', async () => {
  apiGet.mockImplementation(async (url: string) => ({
    data: { data: url.endsWith('/terms/current') ? null : [] },
  }));
  const account = {
    id: 'business-1', companyName: 'Cebu Offices', businessType: 'corporation',
    registrationNumber: null, taxId: null, billingAddress: null, barangay: null,
    city: 'Cebu City', province: 'Cebu', contactPerson: 'Paolo Garcia',
    contactEmail: 'paolo@example.com', contactPhone: '+639170000000',
    accountManagerId: '22222222-2222-4222-8222-222222222222',
    accountManagerName: 'Maria Reyes', accountManagerEmail: 'maria@example.com',
    accountManagerRole: 'admin', accountManagerIsActive: true,
    accountManagerProfileId: '33333333-3333-4333-8333-333333333333',
    accountManagerProfileName: 'support_agent', accountManagerProfileIsActive: true,
    ownerUserId: 'owner-1', ownerName: 'Paolo Garcia', status: 'active', paymentTerms: 'net_30',
    volumeDiscountRate: 10, monthlyCreditLimit: 5000000, notes: null,
    recordVersion: 1,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><BillingSettingsCard account={account} /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByText('Maria Reyes')).toBeInTheDocument();
  expect(screen.getByText(/Admin account · active · Support Agent profile active/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open staff account' })).toHaveAttribute('href', '/staff?search=maria%40example.com');
  expect(screen.getByRole('link', { name: 'Open owned support cases' })).toHaveAttribute(
    'href',
    '/support-tickets?assignedAgentId=22222222-2222-4222-8222-222222222222&active=1&agentName=Maria%20Reyes',
  );
  expect(screen.getByRole('link', { name: 'Assignment audit' })).toHaveAttribute(
    'href',
    '/audit-log?entityType=business_account&entityId=business-1',
  );
});
