import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get },
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import { BillingSettingsCard } from '../BusinessAccountDetailPage';

it('Bug UX-1307 - non-super-admins can see approved terms without receiving mutation controls', async () => {
  get.mockResolvedValue({ data: { data: {
    id: 'terms-1307', version: 4, paymentTerms: 'net_60', volumeDiscountRate: 7.5,
    monthlyCreditLimit: 12_500_000, currency: 'PHP',
    effectiveFrom: '2026-09-01T00:00:00.000Z', reason: 'Approved terms for operator visibility.',
  } } });

  const account = {
    id: 'business-1307', companyName: 'Operator Visibility Co', businessType: 'office',
    registrationNumber: null, taxId: null, billingAddress: null, barangay: null,
    city: 'Cebu City', province: 'Cebu', contactPerson: 'Site Manager',
    contactEmail: 'manager@example.test', contactPhone: '+630000000000',
    accountManagerId: null, ownerUserId: 'owner-1307', status: 'active', paymentTerms: 'net_30',
    volumeDiscountRate: 0, monthlyCreditLimit: 0, notes: null, recordVersion: 4,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BillingSettingsCard account={account} /></QueryClientProvider>);

  expect(await screen.findByText('v4')).toBeInTheDocument();
  expect(screen.getByText('Net 60')).toBeInTheDocument();
  expect(screen.getByText('Approved billing credit')).toBeInTheDocument();
  expect(screen.getByText(/publication and account-manager changes require a super admin/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Preview new terms' })).toBeNull();
});
