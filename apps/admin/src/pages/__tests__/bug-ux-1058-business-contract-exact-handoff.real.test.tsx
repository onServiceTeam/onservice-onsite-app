import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = '22222222-2222-4222-8222-222222222222';

const { getMock, setSearchParamsMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setSearchParamsMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: getMock, post: vi.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => (
    selector({ user: { role: 'admin' } })
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: ACCOUNT_ID }),
    useSearchParams: () => [
      new URLSearchParams(`tab=contracts&contractId=${CONTRACT_ID}`),
      setSearchParamsMock,
    ],
  };
});

import BusinessAccountDetailPage from '../BusinessAccountDetailPage';

beforeEach(() => {
  getMock.mockReset();
  setSearchParamsMock.mockReset();
  getMock.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/business-accounts/${ACCOUNT_ID}`) {
      return { data: { success: true, data: {
        id: ACCOUNT_ID,
        companyName: 'Cebu Build Co',
        businessType: 'corporation',
        registrationNumber: null,
        taxId: null,
        billingAddress: 'Cebu Business Park',
        barangay: 'Lahug',
        city: 'Cebu City',
        province: 'Cebu',
        contactPerson: 'Account Owner',
        contactEmail: 'owner@example.test',
        contactPhone: '+639170000000',
        accountManagerId: null,
        ownerUserId: '55555555-5555-4555-8555-555555555555',
        status: 'active',
        paymentTerms: 'net_30',
        volumeDiscountRate: 0,
        monthlyCreditLimit: 5_000_000,
        notes: null,
        recordVersion: 1,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      } } };
    }
    if (url === `/api/v1/admin/business-accounts/${ACCOUNT_ID}/contracts`) {
      return { data: {
        success: true,
        data: [{
          id: CONTRACT_ID,
          categoryId: 'category-1',
          categoryName: 'Cleaning',
          subcategoryId: 'subcategory-1',
          subcategoryName: 'Post-construction cleaning',
          providerId: null,
          providerName: null,
          contractType: 'recurring',
          frequency: 'monthly',
          agreedRate: 250_000,
          discountPercentage: 0,
          estimatedMonthlyValue: 250_000,
          startDate: '2026-09-01',
          endDate: null,
          autoRenew: false,
          status: 'draft',
          recordVersion: 1,
          publishedAt: null,
          publishedBy: null,
          publishReason: null,
          createdAt: '2026-09-01T00:00:00.000Z',
        }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
});

it('Bug UX-1058 - an exact contract URL filters and identifies the requested contract instead of losing the handoff', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BusinessAccountDetailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('tab', { name: 'Contracts' })).toHaveAttribute('data-state', 'active');
  expect(await screen.findByText('Showing exact contract', { exact: false })).toBeVisible();
  expect(screen.getByText('Post-construction cleaning')).toBeVisible();
  await waitFor(() => {
    expect(getMock).toHaveBeenCalledWith(
      `/api/v1/admin/business-accounts/${ACCOUNT_ID}/contracts`,
      { params: { page: 1, pageSize: 20, contractId: CONTRACT_ID } },
    );
  });
});
