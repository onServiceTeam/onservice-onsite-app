import { it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post },
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

get.mockImplementation(async (url: string) => ({
  data: {
    data: url.endsWith('/terms/current') ? null : [{
      id: 'staff-record-1', user_id: 'user-1', is_active: true,
      account_is_active: true, account_role: 'admin',
      user_first_name: 'Maria', user_last_name: 'Reyes', user_email: 'maria@example.com',
      role_name: 'operations_manager',
    }],
  },
}));
post.mockResolvedValue({ data: { success: true, data: { accountManagerId: 'user-1' } } });

import { BillingSettingsCard } from '../BusinessAccountDetailPage';

it('Bug UX-024 — business account manager assignment uses named active staff instead of a pasted UUID', async () => {
  const account = {
    id: 'business-1', companyName: 'Cebu Offices', businessType: 'corporation',
    registrationNumber: null, taxId: null, billingAddress: null, barangay: null,
    city: 'Cebu City', province: 'Cebu', contactPerson: 'Paolo Garcia',
    contactEmail: 'paolo@example.com', contactPhone: '+639170000000',
    accountManagerId: null, ownerUserId: null, status: 'active', paymentTerms: 'net_30',
    volumeDiscountRate: 10, monthlyCreditLimit: 5000000, notes: null,
    recordVersion: 1,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BillingSettingsCard account={account} /></QueryClientProvider>);

  const picker = await screen.findByRole('combobox', { name: 'Active account manager' });
  expect(screen.queryByText(/Staff user UUID/i)).toBeNull();
  await waitFor(() => expect((picker as HTMLSelectElement).disabled).toBe(false));
  fireEvent.change(picker, { target: { value: 'user-1' } });
  await waitFor(() => expect((picker as HTMLSelectElement).value).toBe('user-1'));
  fireEvent.change(screen.getByLabelText('Assignment reason'), {
    target: { value: 'Assign Maria to own this enterprise relationship.' },
  });
  const assignButton = screen.getByText('Assign') as HTMLButtonElement;
  await waitFor(() => expect(assignButton.disabled).toBe(false));
  fireEvent.click(assignButton);

  await waitFor(() => expect(post).toHaveBeenCalledWith(
    '/api/v1/admin/business-accounts/business-1/assign-manager',
    {
      accountManagerId: 'user-1',
      reason: 'Assign Maria to own this enterprise relationship.',
    },
  ));
});
