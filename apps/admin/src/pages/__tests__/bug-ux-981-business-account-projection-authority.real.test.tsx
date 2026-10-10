import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { OverviewTab } from '../BusinessAccountDetailPage';

it('Bug UX-981 — intake projection fields cannot be mistaken for approved versioned commercial terms', async () => {
  get.mockImplementation(async (url: string) => ({
    data: { success: true, data: url.endsWith('/terms/current') ? null : [] },
  }));
  const account = {
    id: 'business-981', companyName: 'Projection Co', businessType: 'office',
    registrationNumber: null, taxId: null, billingAddress: 'Cebu Business Park', barangay: 'Lahug',
    city: 'Cebu City', province: 'Cebu', contactPerson: 'Account Owner',
    contactEmail: 'owner@example.test', contactPhone: '+630000000000',
    accountManagerId: null, ownerUserId: 'owner-981', status: 'pending', paymentTerms: 'net_60',
    volumeDiscountRate: 12, monthlyCreditLimit: 2_000_000, notes: null, recordVersion: 1,
    createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><OverviewTab account={account} /></QueryClientProvider>);

  expect(screen.getByText('Account projection: volume discount')).toBeInTheDocument();
  expect(screen.getByText('Account projection: billing credit')).toBeInTheDocument();
  expect(screen.getByText('Projected payment terms')).toBeInTheDocument();
  expect(screen.getByText(/not approval evidence/i)).toBeInTheDocument();
  expect(await screen.findByText(/No approved terms version/i)).toBeInTheDocument();
});
