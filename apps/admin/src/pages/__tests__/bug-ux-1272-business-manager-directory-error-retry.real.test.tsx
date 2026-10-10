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

it('Bug UX-1272 - an unavailable account-manager directory cannot be mistaken for an empty choice and can be retried', async () => {
  let staffAttempts = 0;
  apiGet.mockImplementation(async (url: string) => {
    if (url.endsWith('/terms/current')) return { data: { success: true, data: null } };
    if (url.startsWith('/api/v1/staff')) {
      staffAttempts += 1;
      if (staffAttempts === 1) throw new Error('staff directory source offline');
      return { data: { success: true, data: [] } };
    }
    throw new Error(`Unexpected GET: ${url}`);
  });

  const account = {
    id: 'business-1', companyName: 'Cebu Offices', businessType: 'corporation',
    registrationNumber: null, taxId: null, billingAddress: null, barangay: null,
    city: 'Cebu City', province: 'Cebu', contactPerson: 'Paolo Garcia',
    contactEmail: 'paolo@example.com', contactPhone: '+639170000000', accountManagerId: null,
    ownerUserId: null, status: 'active', paymentTerms: 'net_30', volumeDiscountRate: 10,
    monthlyCreditLimit: 5000000, notes: null, recordVersion: 1,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BillingSettingsCard account={account} /></QueryClientProvider>);

  expect(await screen.findByText(/Do not assign an owner until the directory is available/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry staff' }));

  await waitFor(() => expect(staffAttempts).toBe(2));
  expect(screen.queryByText(/Do not assign an owner until the directory is available/)).toBeNull();
});
