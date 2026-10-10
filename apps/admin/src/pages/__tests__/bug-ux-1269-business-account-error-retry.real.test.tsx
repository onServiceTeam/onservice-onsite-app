import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useParams: () => ({ id: ACCOUNT_ID }) };
});

import BusinessAccountDetailPage from '../BusinessAccountDetailPage';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  apiGet.mockReset();
  apiGet
    .mockRejectedValueOnce(new Error('business account source offline'))
    .mockImplementation(async (url: string) => {
      if (url === `/api/v1/admin/business-accounts/${ACCOUNT_ID}`) {
        return { data: { success: true, data: {
          id: ACCOUNT_ID, companyName: 'Cebu Build Co', businessType: 'corporation',
          registrationNumber: null, taxId: null, billingAddress: null, barangay: null,
          city: 'Cebu City', province: 'Cebu', contactPerson: 'Account Owner',
          contactEmail: 'owner@example.test', contactPhone: '+639170000000', accountManagerId: null,
          ownerUserId: null, status: 'active', paymentTerms: 'net_30', volumeDiscountRate: 0,
          monthlyCreditLimit: 500000, notes: null, recordVersion: 1,
          createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
        } } };
      }
      if (url.endsWith('/terms/current')) return { data: { success: true, data: null } };
      if (url.startsWith('/api/v1/staff')) return { data: { success: true, data: [] } };
      throw new Error(`Unexpected GET: ${url}`);
    });
});

it('Bug UX-1269 - a failed Business Account 360 load offers in-place recovery before showing enterprise support context', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/business-accounts/${ACCOUNT_ID}`]}>
        <BusinessAccountDetailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Failed to load business account' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry account' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(4));
  expect(await screen.findByText('Cebu Build Co')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
});
