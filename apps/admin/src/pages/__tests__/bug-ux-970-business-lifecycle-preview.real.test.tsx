import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { post },
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { AccountLifecycleControl } from '../BusinessAccountDetailPage';

it('Bug UX-970 — account approval requires a current impact preview and reason before the final API decision', async () => {
  post.mockImplementation(async (url: string) => {
    if (url.endsWith('/approve/preview')) {
      return { data: { success: true, data: {
        id: '00000000-0000-4000-8000-000000000970', action: 'approve',
        impact: { openBookingCount: 2, openStatementCount: 1 },
        expiresAt: '2026-09-02T12:30:00.000Z', createdAt: '2026-09-02T12:00:00.000Z',
      } } };
    }
    return { data: { success: true } };
  });
  const account = {
    id: 'business-1', companyName: 'Cebu Build Co', businessType: 'other',
    registrationNumber: null, taxId: null, billingAddress: null, barangay: null,
    city: 'Cebu City', province: 'Cebu', contactPerson: 'Site Manager',
    contactEmail: 'manager@example.test', contactPhone: '+630000000000',
    accountManagerId: null, ownerUserId: 'owner-1', status: 'pending', paymentTerms: 'net_30',
    volumeDiscountRate: 0, monthlyCreditLimit: 0, notes: null, recordVersion: 2,
    createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><AccountLifecycleControl account={account} /></QueryClientProvider>);

  fireEvent.click(screen.getByRole('button', { name: 'Review approval' }));
  expect(await screen.findByRole('dialog', { name: 'Approve business account' })).toBeInTheDocument();
  expect(screen.getByText('Open Booking Count')).toBeInTheDocument();
  expect(post).toHaveBeenCalledWith('/api/v1/admin/business-accounts/business-1/approve/preview');

  fireEvent.change(screen.getByLabelText('Decision reason'), {
    target: { value: 'Reviewed registration and commercial impact evidence.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Approve account' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith(
    '/api/v1/admin/business-accounts/business-1/approve',
    {
      previewId: '00000000-0000-4000-8000-000000000970',
      reason: 'Reviewed registration and commercial impact evidence.',
    },
  ));
});
