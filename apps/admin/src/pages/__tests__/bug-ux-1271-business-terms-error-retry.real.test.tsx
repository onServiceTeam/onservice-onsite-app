import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { BillingSettingsCard } from '../BusinessAccountDetailPage';

it('Bug UX-1271 - an unavailable approved-terms read is not shown as no terms and can be retried in place', async () => {
  const accountId = '11111111-1111-4111-8111-111111111111';
  let termsAttempts = 0;
  apiGet.mockImplementation(async (url: string) => {
    if (url.endsWith('/terms/current')) {
      termsAttempts += 1;
      if (termsAttempts === 1) throw new Error('approved terms source offline');
      return { data: { success: true, data: {
        id: 'terms-1', version: 1, paymentTerms: 'net_30', volumeDiscountRate: 0,
        monthlyCreditLimit: 500000, currency: 'PHP', effectiveFrom: '2026-09-01T00:00:00.000Z',
        reason: 'Initial terms',
      } } };
    }
    if (url.startsWith('/api/v1/staff')) return { data: { success: true, data: [] } };
    throw new Error(`Unexpected GET: ${url}`);
  });

  const account = {
    id: accountId, companyName: 'Cebu Build Co', businessType: 'corporation',
    registrationNumber: null, taxId: null, billingAddress: null, barangay: null,
    city: 'Cebu City', province: 'Cebu', contactPerson: 'Account Owner',
    contactEmail: 'owner@example.test', contactPhone: '+639170000000', accountManagerId: null,
    ownerUserId: null, status: 'active', paymentTerms: 'net_30', volumeDiscountRate: 0,
    monthlyCreditLimit: 500000, notes: null, recordVersion: 1,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BillingSettingsCard account={account} /></QueryClientProvider>);

  expect(await screen.findByText(/Do not treat this as no approved terms/)).toBeInTheDocument();
  expect(screen.queryByText(/No approved terms version/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry terms' }));

  await waitFor(() => expect(termsAttempts).toBe(2));
  expect(await screen.findByText('v1')).toBeInTheDocument();
});
