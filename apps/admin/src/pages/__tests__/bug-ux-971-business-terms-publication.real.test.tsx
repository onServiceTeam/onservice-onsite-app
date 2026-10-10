import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post },
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { BillingSettingsCard } from '../BusinessAccountDetailPage';

it('Bug UX-971 — commercial term changes are previewed and published as a prospective immutable version', async () => {
  get.mockImplementation(async (url: string) => ({
    data: { data: url.endsWith('/terms/current') ? {
      id: 'terms-1', version: 1, paymentTerms: 'net_30', volumeDiscountRate: 5,
      monthlyCreditLimit: 5_000_000, currency: 'PHP',
      effectiveFrom: '2026-08-01T00:00:00.000Z', reason: 'Initial approved company terms.',
    } : [] },
  }));
  post.mockImplementation(async (url: string) => {
    if (url.endsWith('/terms/preview')) {
      return { data: { success: true, data: {
        id: '00000000-0000-4000-8000-000000000971',
        action: 'publish_terms',
        impact: { openBookingCount: 3, openStatementCount: 1 },
        proposedTerms: {
          paymentTerms: 'net_60', volumeDiscountRate: 7.5,
          monthlyCreditLimit: 7_500_000, currency: 'PHP',
          effectiveFrom: '2026-09-02T12:00:00.000Z',
        },
        expiresAt: '2026-09-02T12:30:00.000Z',
        createdAt: '2026-09-02T12:00:00.000Z',
      } } };
    }
    return { data: { success: true } };
  });
  const account = {
    id: 'business-1', companyName: 'Cebu Build Co', businessType: 'other',
    registrationNumber: null, taxId: null, billingAddress: null, barangay: null,
    city: 'Cebu City', province: 'Cebu', contactPerson: 'Site Manager',
    contactEmail: 'manager@example.test', contactPhone: '+630000000000',
    accountManagerId: null, ownerUserId: 'owner-1', status: 'active', paymentTerms: 'net_30',
    volumeDiscountRate: 5, monthlyCreditLimit: 5_000_000, notes: null, recordVersion: 8,
    createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BillingSettingsCard account={account} /></QueryClientProvider>);

  expect(await screen.findByText('v1')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Payment terms'), { target: { value: 'net_60' } });
  fireEvent.change(screen.getByLabelText(/Volume discount/), { target: { value: '7.5' } });
  fireEvent.change(screen.getByLabelText(/Approved billing credit/), { target: { value: '75000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview new terms' }));

  expect(await screen.findByRole('dialog', { name: 'Publish new commercial terms' })).toBeInTheDocument();
  expect(post).toHaveBeenCalledWith('/api/v1/admin/business-accounts/business-1/terms/preview', {
    expectedVersion: 8,
    paymentTerms: 'net_60',
    volumeDiscountRate: 7.5,
    monthlyCreditLimit: 7_500_000,
  });
  expect(screen.getByText('Open Booking Count')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Publication reason'), {
    target: { value: 'Approved prospective terms for the expanded account scope.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Publish terms version' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith(
    '/api/v1/admin/business-accounts/business-1/terms/publish',
    {
      previewId: '00000000-0000-4000-8000-000000000971',
      reason: 'Approved prospective terms for the expanded account scope.',
    },
  ));
});
